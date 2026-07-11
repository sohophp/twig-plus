const assert = require("node:assert");

const vscode = require("vscode");

async function run() {
  await openHomeDocument();

  const tests = [
    testTwigPlusCommandsRegistered,
    testTwigDelimiterTyping,
    testImmediateTwigTagTypingKeepsCursor,
    testTwigDelimiterTypingInHtmlAttribute,
    testImeTextTypingIsUntouched,
    testTwigParenthesisTyping,
    testTwigBraceTypingInsideCall,
    testHtmlTagTyping,
    testHtmlEnterBetweenTags,
    testHtmlAttributeQuoteTyping,
    testHtmlAttributeQuotePairDeletion,
    testDeleteInsideTwigTag,
    testEmbeddedBraceTyping,
    testEmbeddedBraceEnter,
    testEmbeddedParenthesisTyping,
    testDocumentFormatting,
    testTwigTagCompletion,
    testHtmlCompletion,
    testTemplatePathCompletion,
    testTemplateReferenceDefinitions,
    testBlockDefinition,
    testMacroDefinitions
  ];

  for (const test of tests) {
    await test();
  }
}

async function testTwigPlusCommandsRegistered() {
  const commands = await vscode.commands.getCommands(true);

  assert.ok(
    commands.includes("twigPlus.applyRecommendedSettings"),
    "recommended settings command should be registered"
  );
  assert.ok(
    commands.includes("twigPlus.showStatus"),
    "status command should be registered"
  );
  assert.ok(
    commands.includes("twigPlus.selectParserEngine"),
    "parser engine command should be registered"
  );
}

async function openHomeDocument() {
  const document = await vscode.workspace.openTextDocument(
    getWorkspaceUri("templates", "page", "home.html.twig")
  );
  await vscode.window.showTextDocument(document);

  const extension = vscode.extensions.getExtension("sohophp.twig-plus");
  assert.ok(extension, "TwigPlus extension should be available");
  await extension.activate();
}

async function testTwigParenthesisTyping() {
  const document = await vscode.workspace.openTextDocument({
    language: "twig",
    content: ""
  });
  const editor = await vscode.window.showTextDocument(document);

  await vscode.commands.executeCommand("type", { text: "{" });
  await vscode.commands.executeCommand("type", { text: "{" });
  await vscode.commands.executeCommand("type", { text: "url" });
  await vscode.commands.executeCommand("type", { text: "(" });

  assert.strictEqual(editor.document.getText(), "{{ url() }}");
  assert.strictEqual(editor.document.offsetAt(editor.selection.active), 7);
}

async function testTwigBraceTypingInsideCall() {
  const document = await vscode.workspace.openTextDocument({
    language: "twig",
    content: ""
  });
  const editor = await vscode.window.showTextDocument(document);

  await vscode.commands.executeCommand("type", { text: "{" });
  await vscode.commands.executeCommand("type", { text: "{" });
  await vscode.commands.executeCommand("type", { text: "url" });
  await vscode.commands.executeCommand("type", { text: "(" });
  await vscode.commands.executeCommand("type", { text: "{" });

  assert.strictEqual(editor.document.getText(), "{{ url({}) }}");
  assert.strictEqual(editor.document.offsetAt(editor.selection.active), 8);
}

async function testHtmlTagTyping() {
  for (const tagName of ["p", "script"]) {
    const document = await vscode.workspace.openTextDocument({ language: "twig", content: "" });
    const editor = await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand("type", { text: "<" });
    await vscode.commands.executeCommand("type", { text: tagName });
    await vscode.commands.executeCommand("type", { text: ">" });
    await waitFor(() => editor.document.getText() === `<${tagName}></${tagName}>`);
    assert.strictEqual(editor.document.offsetAt(editor.selection.active), tagName.length + 2);
  }
}

async function testHtmlEnterBetweenTags() {
  const document = await vscode.workspace.openTextDocument({ language: "twig", content: "" });
  const editor = await vscode.window.showTextDocument(document);
  await vscode.commands.executeCommand("type", { text: "<" });
  await vscode.commands.executeCommand("type", { text: "div" });
  await vscode.commands.executeCommand("type", { text: ">" });
  await vscode.commands.executeCommand("type", { text: "\n" });
  await waitFor(() => editor.document.getText() === "<div>\n    \n</div>");
  assert.strictEqual(editor.document.offsetAt(editor.selection.active), "<div>\n    ".length);
}

async function testHtmlAttributeQuoteTyping() {
  const document = await vscode.workspace.openTextDocument({
    language: "twig",
    content: ""
  });
  const editor = await vscode.window.showTextDocument(document);

  await vscode.commands.executeCommand("type", { text: "<" });
  await vscode.commands.executeCommand("type", { text: "a" });
  await vscode.commands.executeCommand("type", { text: " " });
  await vscode.commands.executeCommand("type", { text: "href" });
  await vscode.commands.executeCommand("type", { text: "=" });

  assert.strictEqual(editor.document.getText(), '<a href="">');
  assert.strictEqual(editor.document.offsetAt(editor.selection.active), 9);
}

async function testHtmlAttributeQuotePairDeletion() {
  for (const quote of ['"', "'"]) {
    const source = `<a href=${quote}${quote}>`;
    const document = await vscode.workspace.openTextDocument({ language: "twig", content: source });
    const editor = await vscode.window.showTextDocument(document);
    const offset = source.indexOf(quote) + 1;
    const position = document.positionAt(offset);
    editor.selection = new vscode.Selection(position, position);
    await vscode.commands.executeCommand("twigPlus.deleteLeft");
    assert.strictEqual(editor.document.getText(), "<a href=>");
    assert.strictEqual(editor.document.offsetAt(editor.selection.active), source.indexOf(quote));
  }
}

async function testDeleteInsideTwigTag() {
  const source = "{% if user %}";
  const document = await vscode.workspace.openTextDocument({ language: "twig", content: source });
  const editor = await vscode.window.showTextDocument(document);
  const offset = source.indexOf("user") + "user".length;
  const position = document.positionAt(offset);
  editor.selection = new vscode.Selection(position, position);
  await vscode.commands.executeCommand("twigPlus.deleteLeft");
  assert.strictEqual(editor.document.getText(), "{% if use %}");
}

async function testEmbeddedBraceTyping() {
  for (const [prefix, expectedPrefix, suffix] of [
    ["<script>class b", "<script>class b ", "</script>"],
    ["<style>.card", "<style>.card ", "</style>"]
  ]) {
    const document = await vscode.workspace.openTextDocument({ language: "twig", content: prefix + suffix });
    const editor = await vscode.window.showTextDocument(document);
    editor.selection = new vscode.Selection(document.positionAt(prefix.length), document.positionAt(prefix.length));
    await vscode.commands.executeCommand("type", { text: "{" });
    assert.strictEqual(editor.document.getText(), `${expectedPrefix}{}${suffix}`);
    assert.strictEqual(editor.document.offsetAt(editor.selection.active), expectedPrefix.length + 1);
  }
}

async function testEmbeddedBraceEnter() {
  const source = "<script>\n    class ThisPage\n</script>";
  const document = await vscode.workspace.openTextDocument({ language: "twig", content: source });
  const editor = await vscode.window.showTextDocument(document);
  const classEnd = source.indexOf("ThisPage") + "ThisPage".length;
  const position = document.positionAt(classEnd);
  editor.selection = new vscode.Selection(position, position);
  await vscode.commands.executeCommand("type", { text: "{" });
  assert.strictEqual(editor.document.lineAt(1).text, "    class ThisPage {}");
  await vscode.commands.executeCommand("type", { text: "\n" });
  await waitFor(() => editor.document.getText().includes("class ThisPage {\n        \n    }"));
  assert.strictEqual(editor.document.offsetAt(editor.selection.active), editor.document.getText().indexOf("\n        \n") + 9);

  const deleteSource = "<script>class Removable</script>";
  const deleteDocument = await vscode.workspace.openTextDocument({ language: "twig", content: deleteSource });
  const deleteEditor = await vscode.window.showTextDocument(deleteDocument);
  const deleteOffset = deleteSource.indexOf("</script>");
  const deletePosition = deleteDocument.positionAt(deleteOffset);
  deleteEditor.selection = new vscode.Selection(deletePosition, deletePosition);
  await vscode.commands.executeCommand("type", { text: "{" });
  await waitFor(() => deleteEditor.document.getText() === "<script>class Removable {}</script>");
  await vscode.commands.executeCommand("twigPlus.deleteLeft");
  assert.strictEqual(deleteEditor.document.getText(), "<script>class Removable </script>");
}

async function testEmbeddedParenthesisTyping() {
  for (const expression of ["constructor", "console.log"]) {
    const source = `<script>${expression}</script>`;
    const document = await vscode.workspace.openTextDocument({ language: "twig", content: source });
    const editor = await vscode.window.showTextDocument(document);
    const offset = source.indexOf("</script>");
    const position = document.positionAt(offset);
    editor.selection = new vscode.Selection(position, position);
    await vscode.commands.executeCommand("type", { text: "(" });
    await waitFor(() => editor.document.getText() === `<script>${expression}()</script>`);
    assert.strictEqual(editor.document.offsetAt(editor.selection.active), `<script>${expression}(`.length);
  }
}

async function testTwigDelimiterTyping() {
  const document = await vscode.workspace.openTextDocument({
    language: "twig",
    content: ""
  });
  const editor = await vscode.window.showTextDocument(document);

  await vscode.commands.executeCommand("type", { text: "{" });
  await vscode.commands.executeCommand("type", { text: "%" });

  assert.strictEqual(editor.document.getText(), "{%  %}");
  assert.strictEqual(editor.document.offsetAt(editor.selection.active), 3);
}

async function testImmediateTwigTagTypingKeepsCursor() {
  const document = await vscode.workspace.openTextDocument({ language: "twig", content: "" });
  const editor = await vscode.window.showTextDocument(document);
  await vscode.commands.executeCommand("type", { text: "{" });
  await vscode.commands.executeCommand("type", { text: "%" });
  await vscode.commands.executeCommand("type", { text: "e" });
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.strictEqual(editor.document.getText(), "{% e %}");
  assert.strictEqual(editor.document.offsetAt(editor.selection.active), 4);
  await vscode.commands.executeCommand("type", { text: "ndblock" });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.strictEqual(editor.document.getText(), "{% endblock %}");
  assert.strictEqual(editor.document.offsetAt(editor.selection.active), "{% endblock".length);
}

async function testTwigDelimiterTypingInHtmlAttribute() {
  const document = await vscode.workspace.openTextDocument({
    language: "twig",
    content: '<a href="">'
  });
  const editor = await vscode.window.showTextDocument(document);
  const offset = document.getText().indexOf('"') + 1;
  const position = document.positionAt(offset);
  editor.selection = new vscode.Selection(position, position);
  await vscode.commands.executeCommand("type", { text: "{" });
  await vscode.commands.executeCommand("type", { text: "{" });
  await waitFor(() => editor.document.getText() === '<a href="{{  }}">');
  assert.strictEqual(editor.document.offsetAt(editor.selection.active), '<a href="{{ '.length);

  const compactDocument = await vscode.workspace.openTextDocument({
    language: "twig",
    content: '<a href="">'
  });
  const compactEditor = await vscode.window.showTextDocument(compactDocument);
  const compactOffset = compactDocument.getText().indexOf('"') + 1;
  const compactPosition = compactDocument.positionAt(compactOffset);
  compactEditor.selection = new vscode.Selection(compactPosition, compactPosition);
  await vscode.commands.executeCommand("type", { text: "{{}}" });
  await waitFor(() => compactEditor.document.getText() === '<a href="{{  }}">');
  assert.strictEqual(compactEditor.document.offsetAt(compactEditor.selection.active), '<a href="{{ '.length);
}

async function testImeTextTypingIsUntouched() {
  const document = await vscode.workspace.openTextDocument({
    language: "twig",
    content: "<p></p>"
  });
  const editor = await vscode.window.showTextDocument(document);
  const position = document.positionAt(3);
  editor.selection = new vscode.Selection(position, position);
  await vscode.commands.executeCommand("type", { text: "中文输入测试" });
  assert.strictEqual(editor.document.getText(), "<p>中文输入测试</p>");
}

async function testDocumentFormatting() {
  const document = await vscode.workspace.openTextDocument({
    language: "twig",
    content: "{% if user %}\n<div>{{name}}</div>\n{% endif %}"
  });

  const edits = await vscode.commands.executeCommand(
    "vscode.executeFormatDocumentProvider",
    document.uri,
    {
      insertSpaces: true,
      tabSize: 4
    }
  );

  assert.ok(edits.length > 0, "formatter should return edits");
  assert.strictEqual(
    applyTextEdits(document, edits),
    "{% if user %}\n    <div>{{ name }}</div>\n{% endif %}"
  );
}

async function testTwigTagCompletion() {
  const document = await vscode.workspace.openTextDocument({
    language: "twig",
    content: "{% inc %}\n{{ name|upp }}\n{{ pat }}\n{% bl %}\ntwig-bl"
  });

  const tagLabels = await getCompletionLabels(document, new vscode.Position(0, 6));
  assert.ok(tagLabels.includes("include"), "tag completion should include include");
  assert.ok(tagLabels.includes("extends"), "tag completion should include extends");

  const filterLabels = await getCompletionLabels(document, new vscode.Position(1, 11));
  assert.ok(filterLabels.includes("upper"), "filter completion should include upper");

  const functionLabels = await getCompletionLabels(document, new vscode.Position(2, 6));
  assert.ok(functionLabels.includes("path"), "function completion should include path");

  const blockLabels = await getCompletionLabels(document, new vscode.Position(3, 5));
  assert.ok(blockLabels.includes("block"), "bl completion should include block");
  assert.ok(blockLabels.includes("endblock"), "bl completion should include endblock");
  assert.ok(
    !blockLabels.includes("Twig block"),
    "bl completion should not include the full-tag Twig block snippet"
  );

  const snippetLabels = await getCompletionLabels(document, new vscode.Position(4, 7));
  assert.ok(
    snippetLabels.includes("twig-block"),
    "twig-bl completion in text should include the full block snippet"
  );
}

async function testHtmlCompletion() {
  const attributeSource = `<script {% if module %} t`;
  const attributeDocument = await vscode.workspace.openTextDocument({ language: "twig", content: attributeSource });
  const attributeLabels = await getCompletionLabels(attributeDocument, attributeDocument.positionAt(attributeSource.length));
  assert.ok(attributeLabels.includes("type"), "conditional script attributes should include type");
  const source = `<script type="">`;
  const document = await vscode.workspace.openTextDocument({ language: "twig", content: source });
  const valueStart = source.indexOf('type="') + 'type="'.length;
  const valueLabels = await getCompletionLabels(document, document.positionAt(valueStart));
  assert.ok(valueLabels.includes("module"), "script type values should include module");
  assert.ok(valueLabels.includes("text/javascript"), "script type values should include text/javascript");

  const anchorSource = `<a tar`;
  const anchorDocument = await vscode.workspace.openTextDocument({ language: "twig", content: anchorSource });
  const anchorLabels = await getCompletionLabels(anchorDocument, anchorDocument.positionAt(anchorSource.length));
  assert.ok(anchorLabels.includes("target"), "anchor attributes should include target");

  const targetSource = `<a target="">`;
  const targetDocument = await vscode.workspace.openTextDocument({ language: "twig", content: targetSource });
  const targetOffset = targetSource.indexOf('"') + 1;
  const targetLabels = await getCompletionLabels(targetDocument, targetDocument.positionAt(targetOffset));
  for (const value of ["_blank", "_self", "_parent", "_top"]) {
    assert.ok(targetLabels.includes(value), `anchor target values should include ${value}`);
  }

  const targetEditor = await vscode.window.showTextDocument(targetDocument);
  const targetPosition = targetDocument.positionAt(targetOffset);
  targetEditor.selection = new vscode.Selection(targetPosition, targetPosition);
  await vscode.commands.executeCommand("type", { text: "_" });
  assert.strictEqual(targetEditor.document.getText(), `<a target="_">`);
  const typedTargetLabels = await getCompletionLabels(targetEditor.document, targetEditor.selection.active);
  assert.ok(typedTargetLabels.includes("_blank"), "typed underscore should retain target value completions");

  const closingSource = `<script></`;
  const closingDocument = await vscode.workspace.openTextDocument({ language: "twig", content: closingSource });
  const closingLabels = await getCompletionLabels(closingDocument, closingDocument.positionAt(closingSource.length));
  assert.ok(closingLabels.includes("script"), "closing-tag completion should include script");

  const constructorSource = `<script>class Page { cons }</script>`;
  const constructorDocument = await vscode.workspace.openTextDocument({ language: "twig", content: constructorSource });
  const constructorOffset = constructorSource.indexOf("cons") + 4;
  const constructorLabels = await getCompletionLabels(constructorDocument, constructorDocument.positionAt(constructorOffset));
  assert.ok(constructorLabels.includes("constructor"), "script completion should include constructor");
}

async function testTemplatePathCompletion() {
  const document = await openWorkspaceDocument("templates", "page", "home.html.twig");
  const position = findPositionAfter(document, "{% include 'partials/");
  const labels = await getCompletionLabels(document, position);

  assert.ok(
    labels.includes("partials/card.html.twig"),
    "template completion should include partials/card.html.twig"
  );
  assert.ok(
    labels.includes("partials/panel.html.twig"),
    "template completion should include partials/panel.html.twig"
  );
}

async function testTemplateReferenceDefinitions() {
  const document = await openWorkspaceDocument("templates", "page", "home.html.twig");

  await assertDefinitionTarget(
    document,
    "base.html.twig",
    ["templates", "base.html.twig"]
  );
  await assertDefinitionTarget(
    document,
    "partials/card.html.twig",
    ["templates", "partials", "card.html.twig"]
  );
  await assertDefinitionTarget(
    document,
    "partials/panel.html.twig",
    ["templates", "partials", "panel.html.twig"]
  );
  await assertDefinitionTarget(
    document,
    "macros/forms.html.twig",
    ["templates", "macros", "forms.html.twig"]
  );
}

async function testBlockDefinition() {
  const document = await openWorkspaceDocument("templates", "page", "home.html.twig");
  const location = await getSingleDefinition(
    document,
    findPositionInside(document, "{% block content %}", "content")
  );

  assert.strictEqual(
    location.uri.toString(),
    getWorkspaceUri("templates", "base.html.twig").toString()
  );
  assert.strictEqual(location.range.start.line, 0);
}

async function testMacroDefinitions() {
  const document = await openWorkspaceDocument("templates", "page", "home.html.twig");

  const inputLocation = await getSingleDefinition(
    document,
    findPositionInside(document, "forms.input", "input")
  );
  assert.strictEqual(
    inputLocation.uri.toString(),
    getWorkspaceUri("templates", "macros", "forms.html.twig").toString()
  );
  assert.strictEqual(inputLocation.range.start.line, 0);

  const buttonLocation = await getSingleDefinition(
    document,
    findPositionInside(document, "button('Save')", "button")
  );
  assert.strictEqual(
    buttonLocation.uri.toString(),
    getWorkspaceUri("templates", "macros", "forms.html.twig").toString()
  );
  assert.strictEqual(buttonLocation.range.start.line, 4);
}

async function assertDefinitionTarget(document, needle, targetSegments) {
  const location = await getSingleDefinition(
    document,
    findPositionInside(document, needle, needle.split("/").pop())
  );

  assert.strictEqual(location.uri.toString(), getWorkspaceUri(...targetSegments).toString());
  assert.strictEqual(location.range.start.line, 0);
}

async function getSingleDefinition(document, position) {
  const definitions = await vscode.commands.executeCommand(
    "vscode.executeDefinitionProvider",
    document.uri,
    position
  );

  assert.ok(definitions.length > 0, "definition provider should return a target");
  return definitions[0];
}

async function getCompletionLabels(document, position) {
  const completions = await vscode.commands.executeCommand(
    "vscode.executeCompletionItemProvider",
    document.uri,
    position
  );
  const items = Array.isArray(completions) ? completions : completions.items;

  return items.map((item) => String(item.label));
}

async function openWorkspaceDocument(...segments) {
  return vscode.workspace.openTextDocument(getWorkspaceUri(...segments));
}

function getWorkspaceUri(...segments) {
  const folder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(folder, "workspace folder should be open");
  return vscode.Uri.joinPath(folder.uri, ...segments);
}

function findPositionAfter(document, needle) {
  const offset = document.getText().indexOf(needle);
  assert.notStrictEqual(offset, -1, `expected to find ${needle}`);
  return document.positionAt(offset + needle.length);
}

function findPositionInside(document, haystack, needle) {
  const text = document.getText();
  const haystackOffset = text.indexOf(haystack);
  assert.notStrictEqual(haystackOffset, -1, `expected to find ${haystack}`);
  const needleOffset = haystack.indexOf(needle);
  assert.notStrictEqual(needleOffset, -1, `expected ${haystack} to contain ${needle}`);
  return document.positionAt(haystackOffset + needleOffset + Math.floor(needle.length / 2));
}

function applyTextEdits(document, edits) {
  let text = document.getText();
  const sortedEdits = [...edits].sort(
    (left, right) => document.offsetAt(right.range.start) - document.offsetAt(left.range.start)
  );

  for (const edit of sortedEdits) {
    const start = document.offsetAt(edit.range.start);
    const end = document.offsetAt(edit.range.end);
    text = text.slice(0, start) + edit.newText + text.slice(end);
  }

  return text;
}

async function waitFor(predicate, timeout = 1000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeout) throw new Error("timed out waiting for editor update");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

module.exports = {
  run
};
