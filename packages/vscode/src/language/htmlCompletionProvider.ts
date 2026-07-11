import * as vscode from "vscode";
import type { CompletionItem as HtmlCompletionItem } from "vscode-html-languageservice";
import { getCachedHybridDocument } from "./parserRuntime";
import { getEmbeddedScriptCompletions, getHtmlCompletions } from "./htmlCompletionLogic";
import { TWIG_DOCUMENT_SELECTOR } from "./documentSelector";

export function registerHtmlCompletionProvider(context: vscode.ExtensionContext): void {
  const provider: vscode.CompletionItemProvider = {
    provideCompletionItems(document, position) {
      const hybrid = getCachedHybridDocument(document);
      if (!hybrid) return [];
      const source = document.getText();
      const offset = document.offsetAt(position);
      const embedded = getEmbeddedScriptCompletions(source, offset, hybrid);
      return (embedded.length ? embedded : getHtmlCompletions(source, offset, hybrid))
        .map((item) => toVsCodeCompletionItem(document, item));
    }
  };

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      TWIG_DOCUMENT_SELECTOR,
      provider,
      "<", " ", "=", "\"", "'", "/", "-", ":", "_", ".", "s"
    )
  );
}

function toVsCodeCompletionItem(document: vscode.TextDocument, source: HtmlCompletionItem): vscode.CompletionItem {
  const item = new vscode.CompletionItem(String(source.label), mapCompletionKind(source.kind));
  item.detail = source.detail;
  item.documentation = typeof source.documentation === "string"
    ? new vscode.MarkdownString(source.documentation)
    : source.documentation?.value
      ? new vscode.MarkdownString(source.documentation.value)
      : undefined;
  item.sortText = source.sortText;
  item.filterText = source.filterText;
  item.insertText = source.insertTextFormat === 2
    ? new vscode.SnippetString(source.insertText ?? String(source.label))
    : source.insertText;
  if (source.textEdit && "range" in source.textEdit) {
    item.range = new vscode.Range(
      new vscode.Position(source.textEdit.range.start.line, source.textEdit.range.start.character),
      new vscode.Position(source.textEdit.range.end.line, source.textEdit.range.end.character)
    );
    item.insertText = source.insertTextFormat === 2
      ? new vscode.SnippetString(source.textEdit.newText)
      : source.textEdit.newText;
  }
  if (source.additionalTextEdits) {
    item.additionalTextEdits = source.additionalTextEdits.map((edit) =>
      vscode.TextEdit.replace(
        new vscode.Range(
          document.positionAt(virtualOffset(document, edit.range.start.line, edit.range.start.character)),
          document.positionAt(virtualOffset(document, edit.range.end.line, edit.range.end.character))
        ),
        edit.newText
      )
    );
  }
  return item;
}

function virtualOffset(document: vscode.TextDocument, line: number, character: number): number {
  return document.offsetAt(new vscode.Position(line, character));
}

function mapCompletionKind(kind: number | undefined): vscode.CompletionItemKind {
  if (kind === 10) return vscode.CompletionItemKind.Property;
  if (kind === 12) return vscode.CompletionItemKind.Value;
  if (kind === 15) return vscode.CompletionItemKind.Snippet;
  return vscode.CompletionItemKind.Text;
}
