import * as vscode from "vscode";
import { unwrapTwigComment, wrapTwigComment } from "./twigCommentLogic";

export function registerTwigCommentController(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerTextEditorCommand("twigPlus.toggleLineComment", async (editor) => {
      if (editor.document.languageId !== "twig") return;

      const lineNumbers = getSelectedLineNumbers(editor.selections);
      const lines = lineNumbers.map((lineNumber) => editor.document.lineAt(lineNumber));
      const uncomment = lines.every((line) => !line.text.trim() || unwrapTwigComment(line.text) !== null);

      await editor.edit((edit) => {
        for (const line of lines) {
          const replacement = uncomment
            ? unwrapTwigComment(line.text)
            : wrapTwigComment(line.text);
          if (replacement !== null && replacement !== line.text) {
            edit.replace(line.range, replacement);
          }
        }
      });
    })
  );
}

function getSelectedLineNumbers(selections: readonly vscode.Selection[]): number[] {
  const lineNumbers = new Set<number>();
  for (const selection of selections) {
    const endLine = selection.end.character === 0 && selection.end.line > selection.start.line
      ? selection.end.line - 1
      : selection.end.line;
    for (let line = selection.start.line; line <= endLine; line += 1) {
      lineNumbers.add(line);
    }
  }
  return [...lineNumbers].sort((left, right) => left - right);
}
