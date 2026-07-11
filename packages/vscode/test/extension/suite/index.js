const assert = require("node:assert");

const vscode = require("vscode");

async function run() {
  await openHomeDocument();

  const tests = [
    testTwigPlusCommandsRegistered,
    testTwigDelimiterTyping,
    testTwigParenthesisTyping,
    testTwigBraceTypingInsideCall,
    testHtmlTagTyping,
    testHtmlAttributeQuoteTyping,
    testDocumentFormatting,
    testTwigTagCompletion,
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
  const document = await vscode.workspace.openTextDocument({
    language: "twig",
    content: ""
  });
  const editor = await vscode.window.showTextDocument(document);

  await vscode.commands.executeCommand("type", { text: "<" });
  await vscode.commands.executeCommand("type", { text: "p" });
  await vscode.commands.executeCommand("type", { text: ">" });

  assert.strictEqual(editor.document.getText(), "<p></p>");
  assert.strictEqual(editor.document.offsetAt(editor.selection.active), 3);
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
    content: "{% inc %}\n{{ name|upp }}\n{{ pat }}"
  });

  const tagLabels = await getCompletionLabels(document, new vscode.Position(0, 6));
  assert.ok(tagLabels.includes("include"), "tag completion should include include");
  assert.ok(tagLabels.includes("extends"), "tag completion should include extends");

  const filterLabels = await getCompletionLabels(document, new vscode.Position(1, 11));
  assert.ok(filterLabels.includes("upper"), "filter completion should include upper");

  const functionLabels = await getCompletionLabels(document, new vscode.Position(2, 6));
  assert.ok(functionLabels.includes("path"), "function completion should include path");
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

module.exports = {
  run
};
