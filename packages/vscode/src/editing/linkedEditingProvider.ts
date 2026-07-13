import * as vscode from "vscode";
import { TWIG_DOCUMENT_SELECTOR } from "../language/documentSelector";
import { getLinkedHtmlTagRanges } from "./htmlLinkedEditing";

export function registerHtmlLinkedEditingProvider(context: vscode.ExtensionContext): void {
  context.subscriptions.push(vscode.languages.registerLinkedEditingRangeProvider(TWIG_DOCUMENT_SELECTOR, {
    provideLinkedEditingRanges(document, position) {
      if (!vscode.workspace.getConfiguration("twigPlus.editing", document).get("linkedHtmlTags", true)) return null;
      const ranges = getLinkedHtmlTagRanges(document.getText(), document.offsetAt(position));
      if (!ranges) return null;
      return {
        ranges: ranges.map((range) => new vscode.Range(document.positionAt(range.start), document.positionAt(range.end))),
        wordPattern: /[A-Za-z][\w:-]*/
      };
    }
  }));
}
