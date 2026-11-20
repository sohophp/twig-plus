const assert = require("node:assert/strict");
const fs = require("node:fs");
const vscode = require("vscode");

async function run() {
  const root = vscode.workspace.workspaceFolders[0].uri;
  const report = { vscodeVersion: vscode.version, status: "running", checks: [] };
  const check = async (name, action) => { await action(); report.checks.push(name); console.log(`[PHP/Twig definitions] PASS ${name}`); };
  try {
    await check("explicit PHP 8.5 target setting", async () => assert.equal(vscode.workspace.getConfiguration("phpCompanion", root).get("phpVersion"), "8.5"));
    for (const id of ["sohophp.php-companion", "sohophp.php-companion-symfony", "sohophp.twig-plus"]) {
      const extension = vscode.extensions.getExtension(id);
      assert.ok(extension, `Missing actual source extension ${id}`); await extension.activate();
    }
    const controller = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(root, "src/PageController.php"));
    const user = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(root, "src/User.php"));
    const plain = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(root, "templates/plain.html.twig"));
    const named = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(root, "templates/site/page.html.twig"));
    await vscode.window.showTextDocument(controller);
    const diskController = fs.readFileSync(controller.uri.fsPath, "utf8");
    const diskPlain = fs.readFileSync(plain.uri.fsPath, "utf8");
    const location = (document, offset, length) => ({ uri: document.uri.toString(), range: {
      start: { line: document.positionAt(offset).line, character: document.positionAt(offset).character },
      end: { line: document.positionAt(offset + length).line, character: document.positionAt(offset + length).character }
    } });
    const definitions = async (document, offset) => (await vscode.commands.executeCommand(
      "vscode.executeDefinitionProvider", document.uri, document.positionAt(offset)) ?? []).map((entry) => ({
        uri: (entry.uri ?? entry.targetUri).toString(), range: {
          start: { line: (entry.range ?? entry.targetSelectionRange).start.line, character: (entry.range ?? entry.targetSelectionRange).start.character },
          end: { line: (entry.range ?? entry.targetSelectionRange).end.line, character: (entry.range ?? entry.targetSelectionRange).end.character }
        }
      }));
    const refresh = async () => {
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        if (await vscode.commands.executeCommand("twigPlus._refreshPhpContexts")) return;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error("Actual PHP context provider never became ready.");
    };
    await refresh();
    const rootDefinition = async (document, occurrence) => {
      const source = controller.getText();
      const key = occurrence === "plain" ? source.indexOf("'person'") : source.lastIndexOf("'person'");
      assert.deepEqual(await definitions(document, document.getText().indexOf("person") + 2), [location(controller, key + 1, 6)]);
    };
    await check("plain exact render key", () => rootDefinition(plain, "plain"));
    await check("namespace exact render key", () => rootDefinition(named, "named"));
    for (const document of [plain, named]) await check(`${document === plain ? "plain" : "namespace"} exact getter`, async () => {
      assert.deepEqual(await definitions(document, document.getText().indexOf("name") + 2), [location(user, user.getText().indexOf("getName"), 7)]);
    });
    for (const document of [plain, named]) for (const word of ["person", "name"]) {
      await check(`${document === plain ? "plain" : "namespace"} ${word} completion`, async () => {
        const result = await vscode.commands.executeCommand("vscode.executeCompletionItemProvider", document.uri,
          document.positionAt(document.getText().indexOf(word) + 2));
        const items = Array.isArray(result) ? result : result?.items ?? [];
        assert.ok(items.some((item) => (typeof item.label === "string" ? item.label : item.label.label) === word));
      });
    }
    const controllerEditor = await vscode.window.showTextDocument(controller);
    await controllerEditor.edit((edit) => edit.insert(new vscode.Position(0, 0), "// unsaved prefix\n"));
    await refresh();
    await check("unsaved PHP source shift", () => rootDefinition(plain, "plain"));
    await check("unsaved namespace source shift", () => rootDefinition(named, "named"));
    await vscode.commands.executeCommand("undo"); await refresh();
    await check("PHP source Undo", () => rootDefinition(plain, "plain"));
    await vscode.commands.executeCommand("redo"); await refresh();
    await check("PHP source Redo", () => rootDefinition(named, "named"));
    await vscode.commands.executeCommand("undo"); await refresh();
    await check("unsaved source never wrote disk", async () => assert.equal(fs.readFileSync(controller.uri.fsPath, "utf8"), diskController));

    const editor = await vscode.window.showTextDocument(plain);
    for (const [name, text, word] of [
      ["unknown receiver", "{{ unknown.person }}", "person"], ["string", '{{ "person" }}', "person"],
      ["comment", "{# person #}", "person"], ["HTML", "<p>person.name</p>", "name"],
      ["filter", "{{ value|person }}", "person"], ["local receiver", "{% set person = {} %}{{ person.name }}", "name"]
    ]) {
      await editor.edit((edit) => edit.replace(new vscode.Range(plain.positionAt(0), plain.positionAt(plain.getText().length)), text));
      await check(`no PHP target for ${name}`, async () => assert.deepEqual(await definitions(plain, text.indexOf(word) + 2), []));
    }
    await editor.edit((edit) => edit.replace(new vscode.Range(plain.positionAt(0), plain.positionAt(plain.getText().length)), diskPlain));
    await refresh();
    const rename = await vscode.commands.executeCommand("vscode.executeDocumentRenameProvider", plain.uri, plain.positionAt(5), "account");
    assert.ok(rename && await vscode.workspace.applyEdit(rename));
    await check("cross-language Rename applies once", async () => {
      assert.ok(plain.getText().includes("account.name")); assert.ok(controller.getText().includes("'account' => $person"));
    });
    await vscode.commands.executeCommand("undo");
    await check("cross-language Rename Undo", async () => { assert.equal(plain.getText(), diskPlain); assert.equal(controller.getText(), diskController); });
    await vscode.commands.executeCommand("redo");
    await check("cross-language Rename Redo", async () => { assert.ok(plain.getText().includes("account.name")); assert.ok(controller.getText().includes("'account' => $person")); });
    await vscode.commands.executeCommand("undo"); await refresh();
    await check("post-Rename source precision", () => rootDefinition(plain, "plain"));
    await check("cross-language Rename never wrote disk", async () => {
      assert.equal(fs.readFileSync(controller.uri.fsPath, "utf8"), diskController); assert.equal(fs.readFileSync(plain.uri.fsPath, "utf8"), diskPlain);
    });
    report.status = "passed";
  } catch (error) { report.status = "failed"; report.error = String(error.stack ?? error); throw error; }
  finally { fs.writeFileSync(process.env.TWIG_PLUS_PHP_DEFINITION_REPORT, JSON.stringify(report, null, 2)); }
}
module.exports = { run };
