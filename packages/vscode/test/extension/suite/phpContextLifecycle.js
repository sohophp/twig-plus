const assert = require("node:assert/strict");
const fs = require("node:fs");
const vscode = require("vscode");

async function run() {
  const root = vscode.workspace.workspaceFolders[0].uri;
  const report = { vscodeVersion: vscode.version, indexingMode: process.env.TWIG_PLUS_TEST_INDEXING_MODE,
    phpVersion: process.env.TWIG_PLUS_TEST_PHP_VERSION, refreshCommandsCalled: 0, status: "running", checks: [], observations: [] };
  const check = async (name, action) => { await action(); report.checks.push(name); console.log(`[PHP/Twig lifecycle] PASS ${name}`); };
  try {
    await check("explicit mode and PHP target", async () => {
      const configuration = vscode.workspace.getConfiguration("phpCompanion", root);
      assert.equal(configuration.get("indexing.mode"), report.indexingMode);
      assert.equal(configuration.get("phpVersion"), report.phpVersion);
      assert.equal(vscode.workspace.getConfiguration("editor", root).get("wordBasedSuggestions"), "off");
      report.wordBasedSuggestions = "off";
    });
    for (const id of ["sohophp.php-companion", "sohophp.php-companion-symfony", "sohophp.twig-plus"]) {
      const extension = vscode.extensions.getExtension(id); assert.ok(extension, `Missing actual ${id}`); await extension.activate();
    }
    const userUri = vscode.Uri.joinPath(root, "src/User.php");
    const controllerUri = vscode.Uri.joinPath(root, "src/PageController.php");
    const adminUri = vscode.Uri.joinPath(root, "src/Admin.php");
    const diskUser = fs.readFileSync(userUri.fsPath, "utf8");
    const diskController = fs.readFileSync(controllerUri.fsPath, "utf8");
    const templates = await Promise.all(["templates/plain.html.twig", "templates/site/page.html.twig"].map((file) =>
      vscode.workspace.openTextDocument(vscode.Uri.joinPath(root, file))));
    for (const document of templates) await vscode.window.showTextDocument(document, { preview: false });
    const plain = templates[0];
    const positionAt = (text, offset) => { const lines = text.slice(0, offset).split("\n"); return { line: lines.length - 1, character: lines.at(-1).length }; };
    const source = (uri) => vscode.workspace.textDocuments.find((document) => !document.isClosed && document.uri.toString() === uri.toString())?.getText() ?? fs.readFileSync(uri.fsPath, "utf8");
    const expectedLocation = (uri, method) => { const text = source(uri), offset = text.indexOf(method); assert.ok(offset >= 0); return {
      uri: uri.toString(), range: { start: positionAt(text, offset), end: positionAt(text, offset + method.length) }
    }; };
    const definitions = async (document, word) => (await vscode.commands.executeCommand("vscode.executeDefinitionProvider", document.uri,
      document.positionAt(document.getText().indexOf(`.${word}`) + 2)) ?? []).map((entry) => {
      const range = entry.range ?? entry.targetSelectionRange;
      return { uri: (entry.uri ?? entry.targetUri).toString(), range: { start: { line: range.start.line, character: range.start.character }, end: { line: range.end.line, character: range.end.character } } };
    });
    const read = async (document, member) => {
      const result = await vscode.commands.executeCommand("vscode.executeCompletionItemProvider", document.uri, document.positionAt(document.getText().indexOf("person.") + "person.".length));
      const items = Array.isArray(result) ? result : result?.items ?? [];
      const hover = member ? await vscode.commands.executeCommand("vscode.executeHoverProvider", document.uri, document.positionAt(document.getText().indexOf(`.${member}`) + 2)) : [];
      return { uri: document.uri.toString(), completion: items.map((item) => typeof item.label === "string" ? item.label : item.label.label).filter((name) => ["name", "title", "role", "code"].includes(name)).sort(),
        completionItems: items.map((item) => ({ label: item.label, kind: item.kind, detail: item.detail, insertText: item.insertText, range: item.range })),
        definitions: Object.fromEntries(await Promise.all(["name", "title", "role", "code"].map(async (name) => [name, await definitions(document, name)]))),
        hover: (hover ?? []).flatMap((entry) => entry.contents.map((part) => typeof part === "string" ? part : part.value)).join("\n") };
    };
    const settle = async (stage, member, uri, method, type) => {
      const started = Date.now(); let last;
      while (Date.now() - started < 5_000) {
        last = await Promise.all(templates.map((document) => read(document, member)));
        try {
          for (const sample of last) {
            assert.deepEqual(sample.completion, member ? [member] : []);
            for (const name of ["name", "title", "role", "code"]) assert.deepEqual(sample.definitions[name], name === member ? [expectedLocation(uri, method)] : []);
            const completions = sample.completionItems.map((item) => ({ label: item.label, kind: item.kind, detail: item.detail })).sort((left, right) => String(left.label).localeCompare(String(right.label)));
            const expectedCompletions = member ? [
              { label: method, kind: vscode.CompletionItemKind.Method, detail: `${method}() · ${type}` },
              { label: member, kind: vscode.CompletionItemKind.Property, detail: `Project property · ${type}` }
            ].sort((left, right) => left.label.localeCompare(right.label)) : [];
            assert.deepEqual(completions, expectedCompletions);
            if (member) assert.ok(sample.hover.includes(`${member}: ${type}`), `Missing ${type} in ${sample.hover}`);
          }
          report.observations.push({ stage, elapsedMs: Date.now() - started, templates: last }); return;
        } catch (error) { report.lastMismatch = { stage, error: String(error), samples: last }; }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error(`${stage} did not converge within 5000ms: ${JSON.stringify(last)}`);
    };
    const userState = (stage, member) => settle(stage, member, userUri, member === "name" ? "getName" : "getTitle", "string");
    await check("automatic initial contexts", () => userState("initial", "name"));
    let user = await vscode.workspace.openTextDocument(userUri);
    let userEditor = await vscode.window.showTextDocument(user, { preview: false });
    const renameGetter = async (from, to) => { const offset = user.getText().indexOf(from); assert.ok(offset >= 0); assert.ok(await userEditor.edit((edit) => edit.replace(new vscode.Range(user.positionAt(offset), user.positionAt(offset + from.length)), to))); };
    await renameGetter(": string { return 'Ada'; }", ": int { return 1; }");
    await check("automatic unsaved member return type", () => settle("return-type-int", "name", userUri, "getName", "int"));
    await vscode.commands.executeCommand("undo");
    await check("automatic member return type Undo", () => userState("return-type-undo", "name"));
    await vscode.commands.executeCommand("redo");
    await check("automatic member return type Redo", () => settle("return-type-redo", "name", userUri, "getName", "int"));
    await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
    await check("discarded member return type restores disk", () => userState("return-type-discard", "name"));
    user = await vscode.workspace.openTextDocument(userUri); userEditor = await vscode.window.showTextDocument(user, { preview: false });
    await renameGetter("getName", "getTitle");
    await check("automatic unsaved getter update", () => userState("unsaved-getter", "title"));
    await vscode.commands.executeCommand("undo");
    await check("automatic getter Undo", () => userState("getter-undo", "name"));
    await vscode.commands.executeCommand("redo");
    await check("automatic getter Redo", () => userState("getter-redo", "title"));
    await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
    await check("discarded getter restores disk", () => userState("getter-close", "name"));
    user = await vscode.workspace.openTextDocument(userUri); userEditor = await vscode.window.showTextDocument(user, { preview: false });
    await renameGetter("getName", "getTitle");
    await check("same PHP file reopens and refreshes", () => userState("getter-reopen", "title"));
    const controller = await vscode.workspace.openTextDocument(controllerUri);
    const controllerEditor = await vscode.window.showTextDocument(controller, { preview: false });
    const typeOffset = controller.getText().indexOf("User $person"); assert.ok(typeOffset >= 0);
    assert.ok(await controllerEditor.edit((edit) => edit.replace(new vscode.Range(controller.positionAt(typeOffset), controller.positionAt(typeOffset + 4)), "Admin")));
    await check("automatic Controller type update", () => settle("controller-admin", "role", adminUri, "getRole", "int"));
    await vscode.commands.executeCommand("undo");
    await check("automatic Controller type Undo", () => userState("controller-undo", "title"));
    await vscode.commands.executeCommand("redo");
    await check("automatic Controller type Redo", () => settle("controller-redo", "role", adminUri, "getRole", "int"));
    await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
    await check("discarded Controller preserves other unsaved type", () => userState("controller-close", "title"));
    await vscode.window.showTextDocument(user, { preview: false });
    await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
    await check("discarding last PHP edit restores original types", () => userState("all-close", "name"));
    await check("unsaved changes never wrote PHP disk", async () => { assert.equal(fs.readFileSync(userUri.fsPath, "utf8"), diskUser); assert.equal(fs.readFileSync(controllerUri.fsPath, "utf8"), diskController); });
    // Disk changes are observed through normal file watchers, without context commands.
    await vscode.workspace.fs.writeFile(userUri, Buffer.from(diskUser.replace("getName", "getTitle")));
    await check("disk getter watcher refresh", () => userState("disk-update", "title"));
    await vscode.workspace.fs.delete(userUri);
    await check("deleted disk file preserves a retained open buffer", async () => {
      assert.ok(vscode.workspace.textDocuments.some((document) => document.uri.toString() === userUri.toString() && !document.isClosed));
      await userState("retained-buffer-delete", "title");
    });
    await vscode.workspace.fs.writeFile(userUri, Buffer.from(diskUser));
    await check("recreated PHP type restores members", () => userState("disk-recreate", "name"));
    const externalUri = vscode.Uri.joinPath(root, "src/External.php");
    const diskExternal = fs.readFileSync(externalUri.fsPath, "utf8");
    const reopenedController = await vscode.workspace.openTextDocument(controllerUri);
    const reopenedControllerEditor = await vscode.window.showTextDocument(reopenedController, { preview: false });
    const externalOffset = reopenedController.getText().indexOf("User $person"); assert.ok(externalOffset >= 0);
    await reopenedControllerEditor.edit((edit) => edit.replace(new vscode.Range(reopenedController.positionAt(externalOffset), reopenedController.positionAt(externalOffset + 4)), "External"));
    await check("never-opened dependency is resolved automatically", async () => {
      assert.ok(!vscode.workspace.textDocuments.some((document) => document.uri.toString() === externalUri.toString()));
      await settle("external-type", "code", externalUri, "getCode", "bool");
    });
    await vscode.workspace.fs.delete(externalUri);
    await check("never-opened deleted type withdraws members", () => settle("external-delete", null));
    await vscode.workspace.fs.writeFile(externalUri, Buffer.from(diskExternal));
    await check("never-opened recreated type restores members", () => settle("external-recreate", "code", externalUri, "getCode", "bool"));
    await vscode.commands.executeCommand("undo");
    await check("Controller restores User after dependency lifecycle", () => userState("external-controller-undo", "name"));
    await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
    await check("Controller discard keeps restored User type", () => userState("external-controller-close", "name"));
    user = await vscode.workspace.openTextDocument(userUri); userEditor = await vscode.window.showTextDocument(user, { preview: false });
    for (let index = 0; index < 9; index++) await renameGetter(index % 2 === 0 ? "getName" : "getTitle", index % 2 === 0 ? "getTitle" : "getName");
    await check("rapid edits publish the final getter", () => userState("rapid-final", "title"));
    await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
    await check("rapid edits discard restores disk getter", () => userState("rapid-close", "name"));
    await vscode.workspace.fs.delete(controllerUri);
    await check("deleted disk Controller preserves retained buffer contexts", async () => {
      assert.ok(vscode.workspace.textDocuments.some((document) => document.uri.toString() === controllerUri.toString() && !document.isClosed));
      await userState("retained-controller-delete", "name");
    });
    await vscode.workspace.fs.writeFile(controllerUri, Buffer.from(diskController));
    await check("recreated Controller restores contexts", () => userState("controller-recreate", "name"));
    const diskControllerUri = vscode.Uri.joinPath(root, "src/DiskController.php");
    const diskControllerSource = "<?php\nnamespace App;\nfinal class DiskController { public function show(User $person): void { $this->render('disk.html.twig', ['person' => $person]); $this->render('@site/disk.html.twig', ['person' => $person]); } }\n";
    const diskTemplates = [];
    for (const relative of ["templates/disk.html.twig", "templates/site/disk.html.twig"]) {
      const uri = vscode.Uri.joinPath(root, relative);
      await vscode.workspace.fs.writeFile(uri, Buffer.from(plain.getText()));
      diskTemplates.push(await vscode.workspace.openTextDocument(uri));
    }
    templates.splice(0, templates.length, ...diskTemplates);
    await vscode.workspace.fs.writeFile(diskControllerUri, Buffer.from(diskControllerSource));
    await check("never-opened Controller publishes both template contexts", async () => {
      assert.ok(!vscode.workspace.textDocuments.some((document) => document.uri.toString() === diskControllerUri.toString()));
      await userState("disk-controller-create", "name");
    });
    await vscode.workspace.fs.delete(diskControllerUri);
    await check("never-opened deleted Controller withdraws contexts", () => settle("disk-controller-delete", null));
    await vscode.workspace.fs.writeFile(diskControllerUri, Buffer.from(diskControllerSource));
    await check("never-opened recreated Controller restores contexts", () => userState("disk-controller-recreate", "name"));
    await check("all fixture PHP disk sources restored", async () => {
      assert.equal(fs.readFileSync(userUri.fsPath, "utf8"), diskUser);
      assert.equal(fs.readFileSync(controllerUri.fsPath, "utf8"), diskController);
      assert.equal(fs.readFileSync(externalUri.fsPath, "utf8"), diskExternal);
    });
    assert.equal(report.refreshCommandsCalled, 0);
    report.status = "passed"; delete report.lastMismatch;
  } catch (error) {
    report.status = "failed"; report.error = String(error.stack ?? error);
    report.failureDocuments = vscode.workspace.textDocuments.filter((document) => document.uri.toString().startsWith(root.toString())).map((document) => ({
      uri: document.uri.toString(), isClosed: document.isClosed, isDirty: document.isDirty, languageId: document.languageId,
      visible: vscode.window.visibleTextEditors.some((editor) => editor.document === document), source: document.getText()
    }));
    // Diagnostic only after an original automatic observation has failed.
    try { report.failurePhpPayload = await vscode.commands.executeCommand("phpCompanion.provideTwigInterop", root); }
    catch (diagnosticError) { report.failureDiagnosticError = String(diagnosticError); }
    throw error;
  }
  finally { fs.writeFileSync(process.env.TWIG_PLUS_PHP_DEFINITION_REPORT, JSON.stringify(report, null, 2)); }
}
module.exports = { run };
