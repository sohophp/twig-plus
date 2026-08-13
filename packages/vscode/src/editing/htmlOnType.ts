import * as vscode from "vscode";
import { computeHtmlOnTypeEdit } from "./htmlOnTypeLogic";

const MODES = new Set(["onType", "onEnter", "off"]);

export function getHtmlTagClosingMode(uri: vscode.Uri): "onType" | "onEnter" | "off" {
  const editing = vscode.workspace.getConfiguration("twigPlus.editing", uri);
  const inspect = editing.inspect<string>("htmlTagClosing");
  const explicit = inspect?.workspaceFolderLanguageValue ?? inspect?.workspaceLanguageValue ?? inspect?.globalLanguageValue ??
    inspect?.workspaceFolderValue ?? inspect?.workspaceValue ?? inspect?.globalValue;
  if (typeof explicit === "string" && MODES.has(explicit)) return explicit as "onType" | "onEnter" | "off";
  const legacy = editing.inspect<boolean>("autoCloseHtmlTags");
  const legacyExplicit = legacy?.workspaceFolderLanguageValue ?? legacy?.workspaceLanguageValue ?? legacy?.globalLanguageValue ??
    legacy?.workspaceFolderValue ?? legacy?.workspaceValue ?? legacy?.globalValue;
  return legacyExplicit === false ? "off" : "onType";
}

export function registerHtmlOnTypeController(context: vscode.ExtensionContext): void {
  let applyingFallback = false;
  context.subscriptions.push(vscode.commands.registerCommand("twigPlus.typeHtmlTagEnd", async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== "twig" || getHtmlTagClosingMode(editor.document.uri) !== "onType" ||
      editor.selections.length !== 1 || !editor.selection.isEmpty) return typeNativeTagEnd();
    const offset = editor.document.offsetAt(editor.selection.active);
    const source = editor.document.getText();
    const hypothetical = source.slice(0, offset) + ">" + source.slice(offset);
    const edit = computeHtmlOnTypeEdit(hypothetical, offset + 1);
    if (!edit) return typeNativeTagEnd();
    const inserted = `>${edit.newText}`;
    const applied = await editor.edit((builder) => builder.insert(editor.selection.active, inserted));
    if (applied) {
      const position = editor.document.positionAt(offset + 1);
      editor.selection = new vscode.Selection(position, position);
    }
  }), vscode.workspace.onDidChangeTextDocument(async (event) => {
    if (applyingFallback || event.document.languageId !== "twig" || getHtmlTagClosingMode(event.document.uri) !== "onType" ||
      event.contentChanges.length !== 1 || event.contentChanges[0].text !== ">") return;
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.toString() !== event.document.uri.toString() || editor.selections.length !== 1 || !editor.selection.isEmpty) return;
    const offset = event.contentChanges[0].rangeOffset + 1;
    const edit = computeHtmlOnTypeEdit(event.document.getText(), offset);
    if (!edit) return;
    applyingFallback = true;
    try {
      const position = event.document.positionAt(edit.start);
      await editor.edit((builder) => builder.insert(position, edit.newText), { undoStopBefore: false, undoStopAfter: true });
      const cursor = event.document.positionAt(offset);
      editor.selection = new vscode.Selection(cursor, cursor);
    } finally {
      applyingFallback = false;
    }
  }));
}

async function typeNativeTagEnd(): Promise<void> {
  await vscode.commands.executeCommand("type", { text: ">" });
}
