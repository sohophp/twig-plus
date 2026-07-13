import * as vscode from "vscode";
import { computeTwigEnterEdit } from "./twigEnter";
import { computeStyleEnterEdit } from "./styleEnter";
import { computeHtmlEnterEdit } from "./htmlTagClose";
import { computeScriptEnterEdit } from "./scriptEnter";

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

async function deleteJavaScriptBracePair(): Promise<void> { await vscode.commands.executeCommand("deleteLeft"); }

async function insertJavaScriptBracePair(): Promise<void> { await vscode.commands.executeCommand("type", { text: "{" }); }

async function insertHtmlCloseTag(): Promise<void> { await vscode.commands.executeCommand("type", { text: ">" }); }

function getIndentUnit(editor: vscode.TextEditor): string {
  if (editor.options.insertSpaces === false) return "\t";
  return " ".repeat(Number(editor.options.tabSize) || 4);
}

async function delegateEnter(): Promise<void> {
  await vscode.commands.executeCommand("type", { text: "\n" });
}
