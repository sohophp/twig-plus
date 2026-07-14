const assert = require("node:assert");
const fs = require("node:fs");

const vscode = require("vscode");

async function run() {
  await openHomeDocument();

  const tests = [
    testTwigPlusCommandsRegistered,
    testTwigDelimiterTyping,
    testTypingTwigTagOffersBlock,
    testManualTwigCompletionWhenAutomaticSuggestionsAreDisabled,
    testAtomicHtmlTagClosing,
    testLinkedHtmlTagEditing,
    testAtomicTwigEnterClosing,
    testAtomicCssBraceClosing,
    testAtomicJavaScriptBraceClosing,
    testRapidTypingIsStable,
    testMultiCursorNativePairUndoRedo,
    testImeTextTypingIsUntouched,
    testDeleteInsideTwigTag,
    testDeleteInsideEmptyTwigTag,
    testDeletedClosingTagCanUndo,
    testTwigOutputTypingInsideEmbeddedJavaScriptString,
    testDocumentFormatting,
    testHoverSignatureAndRangeFormatting,
    testEmbeddedJavaScriptDefinition,
    testEmbeddedJavaScriptRename,
    testEmbeddedJavaScriptSemanticTokens,
    testStructuralTwigQuickFix,
    testInvalidEmbeddedJavaScriptFormattingFailsFast,
    testTwigTagCompletion,
    testHtmlCompletion,
    testTemplatePathCompletion,
    testTemplateReferenceDefinitions,
    testBlockDefinition,
    testMacroDefinitions
  ];

  const report = { vscodeVersion: vscode.version, expected: tests.length, passed: 0, tests: [] };
  let currentTest = "initialization";
  try {
    for (const test of tests) {
      currentTest = test.name;
      const started = Date.now();
      console.log(`[TwigPlus UI] START ${test.name}`);
      await test();
      const durationMs = Date.now() - started;
      report.tests.push({ name: test.name, status: "passed", durationMs });
      report.passed += 1;
      console.log(`[TwigPlus UI] PASS  ${test.name} (${durationMs}ms)`);
    }
  } catch (error) {
    report.tests.push({ name: currentTest, status: "failed", message: String(error) });
    throw error;
  } finally {
    const reportPath = process.env.TWIG_PLUS_UI_REPORT;
    if (reportPath) fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
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
  assert.ok(commands.includes("twigPlus.insertLineBreak"), "atomic Twig Enter command should be registered");
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

async function testDeleteInsideTwigTag() {
  const source = "{% if user %}";
  const document = await vscode.workspace.openTextDocument({ language: "twig", content: source });
  const editor = await vscode.window.showTextDocument(document);
  const offset = source.indexOf("user") + "user".length;
  const position = document.positionAt(offset);
  editor.selection = new vscode.Selection(position, position);
  await vscode.commands.executeCommand("deleteLeft");
  assert.strictEqual(editor.document.getText(), "{% if use %}");
}

async function testDeleteInsideEmptyTwigTag() {
  const source = "{%  %}";
  const document = await vscode.workspace.openTextDocument({ language: "twig", content: source });
  const editor = await vscode.window.showTextDocument(document);
  const position = document.positionAt(3);
  editor.selection = new vscode.Selection(position, position);
  await vscode.commands.executeCommand("deleteLeft");
  await waitFor(() => editor.document.getText() === "{% %}" && editor.document.offsetAt(editor.selection.active) === 2);
  assert.strictEqual(editor.document.getText(), "{% %}");
}

async function testDeletedClosingTagCanUndo() {
  const source = "{% for item in items %}\n{% endfor %}";
  const document = await vscode.workspace.openTextDocument({ language: "twig", content: source });
  const editor = await vscode.window.showTextDocument(document);
  const startOffset = source.indexOf("endfor");
  editor.selection = new vscode.Selection(document.positionAt(startOffset), document.positionAt(startOffset + "endfor".length));
  await vscode.commands.executeCommand("deleteLeft");
  await waitFor(() => editor.document.getText() === "{% for item in items %}\n{%  %}");
  await vscode.commands.executeCommand("undo");
  await waitFor(() => editor.document.getText() === source);
  await vscode.commands.executeCommand("redo");
  await waitFor(() => editor.document.getText() === "{% for item in items %}\n{%  %}");
  await vscode.commands.executeCommand("undo");
  await waitFor(() => editor.document.getText() === source);
  assert.strictEqual(editor.document.getText(), source);
}

async function testTwigOutputTypingInsideEmbeddedJavaScriptString() {
  const source = `<script>const value = ""</script>`;
  const document = await vscode.workspace.openTextDocument({ language: "twig", content: source });
  const editor = await vscode.window.showTextDocument(document);
  const offset = source.indexOf('""') + 1;
  const position = document.positionAt(offset);
  editor.selection = new vscode.Selection(position, position);

  await vscode.commands.executeCommand("twigPlus.insertJavaScriptBracePair");
  await waitFor(() => editor.document.getText() === `<script>const value = "{"</script>` && editor.document.offsetAt(editor.selection.active) === offset + 1);
  await vscode.commands.executeCommand("type", { text: "{" });
  await waitFor(
    () => editor.document.getText() === `<script>const value = "{{}}"</script>` && editor.document.offsetAt(editor.selection.active) === offset + 2
  );
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.strictEqual(editor.document.getText(), `<script>const value = "{{}}"</script>`);
}

async function testTwigDelimiterTyping() {
  const document = await vscode.workspace.openTextDocument({
    language: "twig",
    content: ""
  });
  const editor = await vscode.window.showTextDocument(document);

  await vscode.commands.executeCommand("type", { text: "{" });
  await vscode.commands.executeCommand("type", { text: "%" });

  await waitFor(() => editor.document.getText() === "{%%}" && editor.document.offsetAt(editor.selection.active) === 2);
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.strictEqual(editor.document.getText(), "{%%}", "TwigPlus must not asynchronously rewrite native delimiter text");
}

async function testTypingTwigTagOffersBlock() {
  const document = await vscode.workspace.openTextDocument({ language: "twig", content: "" });
  const editor = await vscode.window.showTextDocument(document);
  await typeCharacters("{%");
  await waitFor(() => editor.document.getText() === "{%%}" && editor.document.offsetAt(editor.selection.active) === 2);
  await vscode.commands.executeCommand("type", { text: "b" });
  await waitFor(() => editor.document.getText() === "{%b%}" && editor.document.offsetAt(editor.selection.active) === 3);
  await vscode.commands.executeCommand("type", { text: "l" });
  await waitFor(() => editor.document.getText() === "{%bl%}" && editor.document.offsetAt(editor.selection.active) === 4);
  await vscode.commands.executeCommand("type", { text: "o" });
  await waitFor(() => editor.document.getText() === "{%blo%}" && editor.document.offsetAt(editor.selection.active) === 5);
  await new Promise((resolve) => setTimeout(resolve, 500));
  // This only succeeds when typing the letters opened the suggestion widget;
  // it deliberately does not invoke the completion provider directly.
  await vscode.commands.executeCommand("acceptSelectedSuggestion");
  await waitFor(() => editor.document.getText() === "{%block name%}");
  assert.strictEqual(editor.document.getText(), "{%block name%}");
}

async function testManualTwigCompletionWhenAutomaticSuggestionsAreDisabled() {
  const config = vscode.workspace.getConfiguration("editor");
  const previousQuick = config.inspect("quickSuggestions")?.globalValue;
  const previousTriggers = config.inspect("suggestOnTriggerCharacters")?.globalValue;
  await config.update("quickSuggestions", false, vscode.ConfigurationTarget.Global);
  await config.update("suggestOnTriggerCharacters", false, vscode.ConfigurationTarget.Global);
  try {
    await vscode.commands.executeCommand("hideSuggestWidget");
    await new Promise((resolve) => setTimeout(resolve, 100));
    const source = "{% bl%}";
    const document = await vscode.workspace.openTextDocument({ language: "twig", content: source });
    const editor = await vscode.window.showTextDocument(document);
    const offset = source.indexOf("%}");
    editor.selection = new vscode.Selection(document.positionAt(offset), document.positionAt(offset));
    await vscode.commands.executeCommand("type", { text: "o" });
    await new Promise((resolve) => setTimeout(resolve, 300));
    assertQuickSuggestionsDisabled(vscode.workspace.getConfiguration("editor", document.uri).get("quickSuggestions"));
    assert.strictEqual(vscode.workspace.getConfiguration("editor", document.uri).get("suggestOnTriggerCharacters"), false);
    assert.strictEqual(editor.document.getText(), "{% blo%}");
    await vscode.commands.executeCommand("editor.action.triggerSuggest");
    await new Promise((resolve) => setTimeout(resolve, 500));
    await vscode.commands.executeCommand("acceptSelectedSuggestion");
    await waitFor(() => editor.document.getText() === "{% block name%}");
  } finally {
    await config.update("quickSuggestions", previousQuick, vscode.ConfigurationTarget.Global);
    await config.update("suggestOnTriggerCharacters", previousTriggers, vscode.ConfigurationTarget.Global);
  }
}

function assertQuickSuggestionsDisabled(value) {
  if (value === false) return;
  assert.deepStrictEqual(value, { other: "off", comments: "off", strings: "off" });
}

async function testAtomicTwigEnterClosing() {
  const source = "    {% block s %}";
  const document = await vscode.workspace.openTextDocument({ language: "twig", content: source });
  const editor = await vscode.window.showTextDocument(document);
  const end = document.positionAt(source.length);
  editor.selection = new vscode.Selection(end, end);
  await vscode.commands.executeCommand("twigPlus.insertLineBreak");
  const expected = "    {% block s %}\n        \n    {% endblock %}";
  await waitFor(() => editor.document.getText() === expected);
  assert.strictEqual(editor.document.offsetAt(editor.selection.active), "    {% block s %}\n        ".length);
  await vscode.commands.executeCommand("undo");
  await waitFor(() => editor.document.getText() === source);
  await vscode.commands.executeCommand("redo");
  await waitFor(() => editor.document.getText() === expected);

  const paired = "{% block s %}\n{% endblock %}";
  const pairedDocument = await vscode.workspace.openTextDocument({ language: "twig", content: paired });
  const pairedEditor = await vscode.window.showTextDocument(pairedDocument);
  const openingEnd = paired.indexOf("%}") + 2;
  pairedEditor.selection = new vscode.Selection(pairedDocument.positionAt(openingEnd), pairedDocument.positionAt(openingEnd));
  await vscode.commands.executeCommand("twigPlus.insertLineBreak");
  await waitFor(() => pairedEditor.document.getText() === "{% block s %}\n    \n{% endblock %}");

  const embedded = `<script>\n    {% if user is defined %}\n</script>`;
  const embeddedDocument = await vscode.workspace.openTextDocument({ language: "twig", content: embedded });
  const embeddedEditor = await vscode.window.showTextDocument(embeddedDocument);
  const embeddedOffset = embedded.indexOf("%}") + 2;
  embeddedEditor.selection = new vscode.Selection(embeddedDocument.positionAt(embeddedOffset), embeddedDocument.positionAt(embeddedOffset));
  await vscode.commands.executeCommand("twigPlus.insertLineBreak");
  await waitFor(() => embeddedEditor.document.getText() === `<script>\n    {% if user is defined %}\n        \n    {% endif %}\n</script>`);
}

async function testAtomicHtmlTagClosing() {
  const document = await vscode.workspace.openTextDocument({ language: "twig", content: "" });
  const editor = await vscode.window.showTextDocument(document);
  await typeCharacters("<div");
  await vscode.commands.executeCommand("twigPlus.typeHtmlTagEnd");
  const expected = "<div></div>";
  await waitFor(() => editor.document.getText() === expected);
  assert.strictEqual(editor.document.offsetAt(editor.selection.active), "<div>".length);
  await vscode.commands.executeCommand("undo");
  await waitFor(() => editor.document.getText() === "<div");
  await vscode.commands.executeCommand("redo");
  await waitFor(() => editor.document.getText() === expected);

  const enterSource = "<script>";
  const enterDocument = await vscode.workspace.openTextDocument({ language: "twig", content: enterSource });
  const enterEditor = await vscode.window.showTextDocument(enterDocument);
  const end = enterDocument.positionAt(enterSource.length);
  enterEditor.selection = new vscode.Selection(end, end);
  await vscode.commands.executeCommand("twigPlus.insertLineBreak");
  await waitFor(() => enterEditor.document.getText() === "<script>\n    \n</script>");
}

async function testLinkedHtmlTagEditing() {
  const source = "<h3></h3>";
  const document = await vscode.workspace.openTextDocument({ language: "twig", content: source });
  const editor = await vscode.window.showTextDocument(document);
  assert.strictEqual(vscode.workspace.getConfiguration("editor", document).get("linkedEditing"), true);
  const afterDigit = source.indexOf("3") + 1;
  editor.selection = new vscode.Selection(document.positionAt(afterDigit), document.positionAt(afterDigit));
  await new Promise((resolve) => setTimeout(resolve, 250));
  await vscode.commands.executeCommand("deleteLeft");
  await waitFor(() => editor.document.getText() === "<h></h>");
  await vscode.commands.executeCommand("type", { text: "4" });
  await waitFor(() => editor.document.getText() === "<h4></h4>");
  await vscode.commands.executeCommand("undo");
  await waitFor(() => editor.document.getText() === "<h></h>");
  await vscode.commands.executeCommand("undo");
  await waitFor(() => editor.document.getText() === source);
}

async function testAtomicCssBraceClosing() {
  const source = "<style>\n    #h3{\n</style>";
  const document = await vscode.workspace.openTextDocument({ language: "twig", content: source });
  const editor = await vscode.window.showTextDocument(document);
  const offset = source.indexOf("\n", source.indexOf("#h3"));
  editor.selection = new vscode.Selection(document.positionAt(offset), document.positionAt(offset));
  await vscode.commands.executeCommand("twigPlus.insertLineBreak");
  const expected = "<style>\n    #h3{\n        \n    }\n</style>";
  await waitFor(() => editor.document.getText() === expected);
  assert.strictEqual(editor.document.offsetAt(editor.selection.active), "<style>\n    #h3{\n        ".length);
  await vscode.commands.executeCommand("undo");
  await waitFor(() => editor.document.getText() === source);

  const existing = "<style>\n    .b {\n        color: red;\n    }\n</style>";
  const existingDocument = await vscode.workspace.openTextDocument({ language: "twig", content: existing });
  const existingEditor = await vscode.window.showTextDocument(existingDocument);
  const existingOffset = existing.indexOf("\n", existing.indexOf(".b"));
  existingEditor.selection = new vscode.Selection(existingDocument.positionAt(existingOffset), existingDocument.positionAt(existingOffset));
  await vscode.commands.executeCommand("twigPlus.insertLineBreak");
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.strictEqual((existingEditor.document.getText().match(/}/g) ?? []).length, 1, "Enter must not duplicate an existing CSS closing brace");
}

async function testAtomicJavaScriptBraceClosing() {
  const source = "<script>\n    document.addEventListener('DOMContentLoaded',()=>{)\n</script>";
  const document = await vscode.workspace.openTextDocument({ language: "twig", content: source });
  const editor = await vscode.window.showTextDocument(document);
  const offset = source.indexOf(")\n</script>");
  editor.selection = new vscode.Selection(document.positionAt(offset), document.positionAt(offset));
  await vscode.commands.executeCommand("twigPlus.insertLineBreak");
  const expected = "<script>\n    document.addEventListener('DOMContentLoaded',()=>{\n        \n    })\n</script>";
  await waitFor(() => editor.document.getText() === expected);
  await vscode.commands.executeCommand("undo");
  await waitFor(() => editor.document.getText() === source);

  const nativeSource = "<script>\n    const ready = ()=>\n</script>";
  const nativeDocument = await vscode.workspace.openTextDocument({ language: "twig", content: nativeSource });
  const nativeEditor = await vscode.window.showTextDocument(nativeDocument);
  const nativeOffset = nativeSource.indexOf("\n</script>");
  nativeEditor.selection = new vscode.Selection(nativeDocument.positionAt(nativeOffset), nativeDocument.positionAt(nativeOffset));
  await new Promise((resolve) => setTimeout(resolve, 250));
  await vscode.commands.executeCommand("twigPlus.insertJavaScriptBracePair");
  const paired = nativeSource.slice(0, nativeOffset) + "{}" + nativeSource.slice(nativeOffset);
  await waitFor(() => nativeEditor.document.getText() === paired);
  await vscode.commands.executeCommand("twigPlus.insertLineBreak");
  const expanded = nativeSource.slice(0, nativeOffset) + "{\n        \n    }" + nativeSource.slice(nativeOffset);
  await waitFor(() => nativeEditor.document.getText() === expanded);
  await vscode.commands.executeCommand("undo");
  await waitFor(() => nativeEditor.document.getText() === paired);
  await vscode.commands.executeCommand("redo");
  await waitFor(() => nativeEditor.document.getText() === expanded);
}

async function testRapidTypingIsStable() {
  const document = await vscode.workspace.openTextDocument({ language: "twig", content: "" });
  const editor = await vscode.window.showTextDocument(document);
  await typeCharacters("{% block");
  await waitFor(() => editor.document.getText() === "{% block%}");
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.strictEqual(editor.document.getText(), "{% block%}");
}

async function testHoverSignatureAndRangeFormatting() {
  const source = `{% block body %}\n    <div>{{path("home",{})}}</div>\n{% endblock %}`;
  const document = await vscode.workspace.openTextDocument({ language: "twig", content: source });
  await vscode.window.showTextDocument(document);
  const hover = await vscode.commands.executeCommand("vscode.executeHoverProvider", document.uri, document.positionAt(source.indexOf("path") + 2));
  assert.ok(Array.isArray(hover) && hover.length > 0, "Twig function hover should be provided by the language server");
  const signatures = await vscode.commands.executeCommand("vscode.executeSignatureHelpProvider", document.uri, document.positionAt(source.indexOf("{}") + 1), "(");
  assert.ok(signatures && signatures.signatures.length > 0, "Twig function signature help should be available");
  const line = document.lineAt(1);
  const edits = await vscode.commands.executeCommand("vscode.executeFormatRangeProvider", document.uri, line.range, { tabSize: 4, insertSpaces: true });
  assert.ok(Array.isArray(edits) && edits.length > 0, "range formatter should return edits");
  assert.strictEqual(
    applyTextEdits(document, edits),
    `{% block body %}\n    <div>{{ path("home", {}) }}</div>\n{% endblock %}`,
    "VS Code should preserve the expanded-range formatting result when it minimizes the LSP edit"
  );
}

async function testEmbeddedJavaScriptDefinition() {
  const source = `<script>\nconst formatTitle = (value) => value.toUpperCase();\nconst title = formatTitle("Home");\n</script>`;
  const document = await vscode.workspace.openTextDocument({ language: "twig", content: source });
  await vscode.window.showTextDocument(document);
  const location = await getSingleDefinition(
    document,
    document.positionAt(source.lastIndexOf("formatTitle") + 2)
  );
  assert.strictEqual(location.uri.toString(), document.uri.toString());
  assert.strictEqual(location.range.start.line, 1);
  assert.strictEqual(location.range.start.character, source.split("\n")[1].indexOf("formatTitle"));
  assert.strictEqual(document.getText(location.range), "formatTitle");
}

async function testEmbeddedJavaScriptRename() {
  const source = `<script>const total = 1; console.log(total);</script>`;
  const renamed = `<script>const sum = 1; console.log(sum);</script>`;
  const document = await vscode.workspace.openTextDocument({ language: "twig", content: source });
  await vscode.window.showTextDocument(document);
  const edit = await vscode.commands.executeCommand(
    "vscode.executeDocumentRenameProvider",
    document.uri,
    document.positionAt(source.lastIndexOf("total") + 2),
    "sum"
  );
  assert.ok(edit instanceof vscode.WorkspaceEdit, "embedded rename should return a workspace edit");
  assert.strictEqual(edit.get(document.uri).length, 2, "declaration and usage should both be renamed");
  assert.strictEqual(await vscode.workspace.applyEdit(edit), true);
  await waitFor(() => document.getText() === renamed);
  await vscode.commands.executeCommand("undo");
  await waitFor(() => document.getText() === source);
  await vscode.commands.executeCommand("redo");
  await waitFor(() => document.getText() === renamed);
}

async function testEmbeddedJavaScriptSemanticTokens() {
  const source = `<script>\nclass Page { render(value) { return value; } }\nconst page = new Page(); page.render("x");\n</script>`;
  const document = await vscode.workspace.openTextDocument({ language: "twig", content: source });
  await vscode.window.showTextDocument(document);
  const legend = await vscode.commands.executeCommand("vscode.provideDocumentSemanticTokensLegend", document.uri);
  const tokens = await vscode.commands.executeCommand("vscode.provideDocumentSemanticTokens", document.uri);
  assert.ok(legend && Array.isArray(legend.tokenTypes), "semantic token legend should be registered");
  assert.ok(tokens && tokens.data && tokens.data.length > 0, "embedded JavaScript should produce semantic tokens");
  const decoded = decodeSemanticTokens(source, tokens.data, legend);
  assert.ok(decoded.some((token) => token.text === "Page" && token.type === "class"));
  assert.ok(decoded.some((token) => token.text === "render" && token.type === "method"));
  assert.ok(decoded.every((token) => token.line === 1 || token.line === 2), "tokens must remain inside the script body");
}

async function testStructuralTwigQuickFix() {
  const source = `{% if user %}\n  {% for item in items %}\n    {{ item }}`;
  const fixed = `${source}\n  {% endfor %}\n{% endif %}`;
  const document = await vscode.workspace.openTextDocument({ language: "twig", content: source });
  await vscode.window.showTextDocument(document);
  await waitFor(() => vscode.languages.getDiagnostics(document.uri)
    .some((diagnostic) => diagnostic.code === "unclosed-tag" && diagnostic.message.includes('"for"')), 4000);
  const diagnostic = vscode.languages.getDiagnostics(document.uri)
    .find((item) => item.code === "unclosed-tag" && item.message.includes('"for"'));
  const actions = await vscode.commands.executeCommand(
    "vscode.executeCodeActionProvider",
    document.uri,
    diagnostic.range,
    vscode.CodeActionKind.QuickFix.value
  );
  const action = actions.find((item) => item.title === "Insert all missing Twig closing tags");
  assert.ok(action && action.edit instanceof vscode.WorkspaceEdit, "LSP should return the atomic structural quick fix");
  assert.strictEqual(action.isPreferred, true);
  assert.strictEqual(await vscode.workspace.applyEdit(action.edit), true);
  await waitFor(() => document.getText() === fixed);
  await vscode.commands.executeCommand("undo");
  await waitFor(() => document.getText() === source);
  await vscode.commands.executeCommand("redo");
  await waitFor(() => document.getText() === fixed);
}

function decodeSemanticTokens(source, data, legend) {
  let line = 0;
  let character = 0;
  const lines = source.split("\n");
  const result = [];
  for (let index = 0; index < data.length; index += 5) {
    line += data[index];
    character = data[index] === 0 ? character + data[index + 1] : data[index + 1];
    result.push({
      text: lines[line].slice(character, character + data[index + 2]),
      type: legend.tokenTypes[data[index + 3]],
      line,
      character
    });
  }
  return result;
}

async function testMultiCursorNativePairUndoRedo() {
  const document = await vscode.workspace.openTextDocument({ language: "twig", content: "\n" });
  const editor = await vscode.window.showTextDocument(document);
  editor.selections = [0, 1].map((line) => new vscode.Selection(new vscode.Position(line, 0), new vscode.Position(line, 0)));
  await vscode.commands.executeCommand("type", { text: "(" });
  await waitFor(() => editor.document.getText() === "()\n()");
  await vscode.commands.executeCommand("undo");
  await waitFor(() => editor.document.getText() === "\n");
  await vscode.commands.executeCommand("redo");
  await waitFor(() => editor.document.getText() === "()\n()");
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
  await vscode.commands.executeCommand("undo");
  await waitFor(() => editor.document.getText() === "<p></p>");
  await vscode.commands.executeCommand("redo");
  await waitFor(() => editor.document.getText() === "<p>中文输入测试</p>");
}

async function testDocumentFormatting() {
  const document = await vscode.workspace.openTextDocument({
    language: "twig",
    content: "{% if user %}\n<div>{{name}}</div>\n{% endif %}"
  });

  const coldStarted = Date.now();
  const edits = await vscode.commands.executeCommand(
    "vscode.executeFormatDocumentProvider",
    document.uri,
    {
      insertSpaces: true,
      tabSize: 4
    }
  );
  const coldMs = Date.now() - coldStarted;

  assert.ok(edits.length > 0, "formatter should return edits");
  assert.strictEqual(
    applyTextEdits(document, edits),
    "{% if user %}\n  <div>{{ name }}</div>\n{% endif %}"
  );
  const warmStarted = Date.now();
  await vscode.commands.executeCommand("vscode.executeFormatDocumentProvider", document.uri, { insertSpaces: true, tabSize: 4 });
  const warmMs = Date.now() - warmStarted;
  console.log(`[TwigPlus UI] formatter budget cold=${coldMs}ms warm=${warmMs}ms`);
  assert.ok(coldMs < 2500, `Extension Host cold formatting exceeded 2500ms: ${coldMs}ms`);
  assert.ok(warmMs < 500, `warm formatter exceeded 500ms: ${warmMs}ms`);
}

async function testInvalidEmbeddedJavaScriptFormattingFailsFast() {
  const uri = getWorkspaceUri("templates", ".twig-plus-invalid-script.html.twig");
  const source = `{% block body %}\n    <script>\n        for (let i, i < 3; i++) {}\n    </script>\n{% endblock %}\n`;
  await vscode.workspace.fs.writeFile(uri, Buffer.from(source));
  try {
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);
    await waitFor(() => vscode.languages.getDiagnostics(uri).some((diagnostic) => diagnostic.source === "TwigPlus JavaScript"), 4000);
    const started = Date.now();
    await vscode.commands.executeCommand("vscode.executeFormatDocumentProvider", uri, { tabSize: 4, insertSpaces: true });
    assert.ok(Date.now() - started < 2000, "invalid embedded formatting should fail within two seconds");
    assert.strictEqual(document.getText(), source, "invalid formatting must preserve the document byte-for-byte");
  } finally {
    await vscode.workspace.fs.delete(uri, { useTrash: false });
  }
}

async function testTwigTagCompletion() {
  const document = await vscode.workspace.openTextDocument({
    language: "twig",
    content: "{% inc %}\n{{ name|upp }}\n{{ pat }}\n{% bl %}\ntwig-bl"
  });

  const tagLabels = await getCompletionLabels(document, new vscode.Position(0, 6));
  assert.ok(tagLabels.includes("include"), "tag completion should include include");
  const extendsSource = `{% e %}`;
  const extendsDocument = await vscode.workspace.openTextDocument({ language: "twig", content: extendsSource });
  const extendsLabels = await getCompletionLabels(extendsDocument, extendsDocument.positionAt(extendsSource.indexOf("e") + 1));
  assert.ok(extendsLabels.includes("extends"), "e completion should include extends");

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

  const shortBlockSource = `{% b %}`;
  const shortBlockDocument = await vscode.workspace.openTextDocument({ language: "twig", content: shortBlockSource });
  const shortBlockLabels = await getCompletionLabels(shortBlockDocument, shortBlockDocument.positionAt(shortBlockSource.indexOf("b") + 1));
  assert.ok(shortBlockLabels.includes("block"), "{% b %} should offer block completion");

  const testSource = `{{ value is def }}`;
  const testDocument = await vscode.workspace.openTextDocument({ language: "twig", content: testSource });
  const testLabels = await getCompletionLabels(testDocument, testDocument.positionAt(testSource.indexOf("def") + 3));
  assert.ok(testLabels.includes("defined"), "Twig is-expression should offer test completion");

  const tagTestSource = `{% if user is def %}`;
  const tagTestDocument = await vscode.workspace.openTextDocument({ language: "twig", content: tagTestSource });
  const tagTestLabels = await getCompletionLabels(tagTestDocument, tagTestDocument.positionAt(tagTestSource.indexOf("def") + 3));
  assert.ok(tagTestLabels.includes("defined"), "Twig if-expression should offer test completion");
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

  const domSource = `<script>document.addEven</script>`;
  const domDocument = await vscode.workspace.openTextDocument({ language: "twig", content: domSource });
  const domOffset = domSource.indexOf("addEven") + "addEven".length;
  const domLabels = await getCompletionLabels(domDocument, domDocument.positionAt(domOffset));
  assert.ok(domLabels.includes("addEventListener"), "embedded JavaScript should include DOM API completion");
  const domCompletions = await getCompletionItems(domDocument, domDocument.positionAt(domOffset));
  const addEventListener = domCompletions.find((item) => String(item.label) === "addEventListener");
  assert.ok(addEventListener, "addEventListener completion should be available");
  assert.ok(addEventListener.insertText instanceof vscode.SnippetString, "callable completion should insert a snippet");
  assert.strictEqual(addEventListener.insertText.value, "addEventListener(${1})");

  const documentSource = `<script>docu</script>`;
  const documentDocument = await vscode.workspace.openTextDocument({ language: "twig", content: documentSource });
  const documentLabels = await getCompletionLabels(documentDocument, documentDocument.positionAt(documentSource.indexOf("docu") + 4));
  assert.ok(documentLabels.includes("document"), "embedded JavaScript should include the browser document global");
  assert.ok(!documentLabels.includes("DocumentDropEdit"), "embedded JavaScript should not leak VSCode auto imports");
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
  const base = await openWorkspaceDocument("templates", "base.html.twig");
  const expectedLine = base.positionAt(base.getText().indexOf("{% block content %}")).line;
  assert.strictEqual(location.range.start.line, expectedLine);
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
  return (await getCompletionItems(document, position)).map((item) => String(item.label));
}

async function getCompletionItems(document, position) {
  const completions = await vscode.commands.executeCommand(
    "vscode.executeCompletionItemProvider",
    document.uri,
    position
  );
  const items = Array.isArray(completions) ? completions : completions.items;
  return items;
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

async function waitFor(predicate, timeout = 3000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeout) throw new Error("timed out waiting for editor update");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function typeCharacters(value) {
  for (const character of value) await vscode.commands.executeCommand("type", { text: character });
}

module.exports = {
  run
};
