import * as vscode from "vscode";
import { computeTwigEnterEdit } from "./twigEnter";
import { computeStyleEnterEdit } from "./styleEnter";
import { computeHtmlEnterEdit, computeHtmlTagCloseEdit } from "./htmlTagClose";
import { computeScriptBracePairDelete, computeScriptBracePairEdit, computeScriptEnterEdit } from "./scriptEnter";

export function registerTwigEnterController(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("twigPlus.insertHtmlCloseTag", insertHtmlCloseTag),
    vscode.commands.registerCommand("twigPlus.insertJavaScriptBracePair", insertJavaScriptBracePair),
    vscode.commands.registerCommand("twigPlus.deleteJavaScriptBracePair", deleteJavaScriptBracePair),
    vscode.commands.registerCommand("twigPlus.insertLineBreak", async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== "twig") return delegateEnter();
    const source = editor.document.getText();
    const selections = editor.selections.map((selection) => ({ anchor: editor.document.offsetAt(selection.anchor), active: editor.document.offsetAt(selection.active) }));
    const options = { eol: editor.document.eol === vscode.EndOfLine.CRLF ? "\r\n" as const : "\n" as const, indentUnit: getIndentUnit(editor) };
    const editing = vscode.workspace.getConfiguration("twigPlus.editing", editor.document.uri);
    const result = editing.get("autoCloseTwigTags", true)
      ? computeTwigEnterEdit(source, selections, options)
      : null;
    const htmlResult = editing.get("autoCloseHtmlTags", true)
      ? computeHtmlEnterEdit(source, selections, options)
      : null;
    const styleResult = editing.get("autoCloseCssBraces", true)
      ? computeStyleEnterEdit(source, selections, options)
      : null;
    const scriptResult = editing.get("autoCloseJavaScriptBraces", true)
      ? computeScriptEnterEdit(source, selections, options)
      : null;
    const resolved = result ?? htmlResult ?? styleResult ?? scriptResult;
    if (!resolved) return delegateEnter();
    const applied = await editor.edit((builder) => {
      for (const edit of resolved.edits) builder.replace(
        new vscode.Range(editor.document.positionAt(edit.start), editor.document.positionAt(edit.end)),
        edit.newText
      );
    });
    if (applied) editor.selections = resolved.selections.map((selection) => {
      const position = editor.document.positionAt(selection.active);
      return new vscode.Selection(position, position);
    });
    })
  );
}

async function deleteJavaScriptBracePair(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== "twig") return vscode.commands.executeCommand("deleteLeft");
  if (!vscode.workspace.getConfiguration("twigPlus.editing", editor.document.uri).get("autoCloseJavaScriptBraces", true)) {
    return vscode.commands.executeCommand("deleteLeft");
  }
  const result = computeScriptBracePairDelete(editor.document.getText(), editor.selections.map((selection) => ({
    anchor: editor.document.offsetAt(selection.anchor), active: editor.document.offsetAt(selection.active)
  })));
  if (!result) return vscode.commands.executeCommand("deleteLeft");
  const applied = await editor.edit((builder) => {
    for (const edit of result.edits) builder.replace(
      new vscode.Range(editor.document.positionAt(edit.start), editor.document.positionAt(edit.end)), ""
    );
  });
  if (applied) editor.selections = result.selections.map((selection) => {
    const position = editor.document.positionAt(selection.active);
    return new vscode.Selection(position, position);
  });
}

async function insertJavaScriptBracePair(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== "twig") return vscode.commands.executeCommand("type", { text: "{" });
  if (!vscode.workspace.getConfiguration("twigPlus.editing", editor.document.uri).get("autoCloseJavaScriptBraces", true)) {
    return vscode.commands.executeCommand("type", { text: "{" });
  }
  const result = computeScriptBracePairEdit(editor.document.getText(), editor.selections.map((selection) => ({
    anchor: editor.document.offsetAt(selection.anchor), active: editor.document.offsetAt(selection.active)
  })));
  if (!result) return vscode.commands.executeCommand("type", { text: "{" });
  const applied = await editor.edit((builder) => {
    for (const edit of result.edits) builder.replace(
      new vscode.Range(editor.document.positionAt(edit.start), editor.document.positionAt(edit.end)), edit.newText
    );
  });
  if (applied) editor.selections = result.selections.map((selection) => {
    const position = editor.document.positionAt(selection.active);
    return new vscode.Selection(position, position);
  });
}

async function insertHtmlCloseTag(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== "twig") return vscode.commands.executeCommand("type", { text: ">" });
  if (!vscode.workspace.getConfiguration("twigPlus.editing", editor.document.uri).get("autoCloseHtmlTags", true)) {
    return vscode.commands.executeCommand("type", { text: ">" });
  }
  const source = editor.document.getText();
  const result = computeHtmlTagCloseEdit(source, editor.selections.map((selection) => ({
    anchor: editor.document.offsetAt(selection.anchor), active: editor.document.offsetAt(selection.active)
  })));
  if (!result) return vscode.commands.executeCommand("type", { text: ">" });
  const applied = await editor.edit((builder) => {
    for (const edit of result.edits) builder.replace(
      new vscode.Range(editor.document.positionAt(edit.start), editor.document.positionAt(edit.end)), edit.newText
    );
  });
  if (applied) editor.selections = result.selections.map((selection) => {
    const position = editor.document.positionAt(selection.active);
    return new vscode.Selection(position, position);
  });
}

function getIndentUnit(editor: vscode.TextEditor): string {
  if (editor.options.insertSpaces === false) return "\t";
  return " ".repeat(Number(editor.options.tabSize) || 4);
}

async function delegateEnter(): Promise<void> {
  await vscode.commands.executeCommand("type", { text: "\n" });
}
