import * as vscode from "vscode";

import { collectTwigBlockSymbols } from "./blockAnalysis";

export function registerTwigDocumentSymbolProvider(
  context: vscode.ExtensionContext
): void {
  const provider: vscode.DocumentSymbolProvider = {
    provideDocumentSymbols(document) {
      const symbols = collectTwigBlockSymbols(document.getText());

      return symbols.map((symbol) => {
        const range = new vscode.Range(
          document.positionAt(symbol.start),
          document.positionAt(symbol.end)
        );
        const selectionRange = new vscode.Range(
          document.positionAt(symbol.nameStart),
          document.positionAt(symbol.nameEnd)
        );

        return new vscode.DocumentSymbol(
          symbol.name,
          "Twig block",
          vscode.SymbolKind.Namespace,
          range,
          selectionRange
        );
      });
    }
  };

  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(
      { language: "twig" },
      provider
    )
  );
}
