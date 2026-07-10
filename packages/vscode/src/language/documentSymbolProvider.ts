import * as vscode from "vscode";

import { collectTwigStructureSymbols } from "@twig-plus/parser";

export function registerTwigDocumentSymbolProvider(
  context: vscode.ExtensionContext
): void {
  const provider: vscode.DocumentSymbolProvider = {
    provideDocumentSymbols(document) {
      const symbols = collectTwigStructureSymbols(document.getText());

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
          getTwigSymbolDetail(symbol.kind),
          getTwigSymbolKind(symbol.kind),
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

function getTwigSymbolDetail(kind: "block" | "macro" | "set"): string {
  if (kind === "macro") {
    return "Twig macro";
  }

  if (kind === "set") {
    return "Twig set capture";
  }

  return "Twig block";
}

function getTwigSymbolKind(kind: "block" | "macro" | "set"): vscode.SymbolKind {
  if (kind === "macro") {
    return vscode.SymbolKind.Function;
  }

  if (kind === "set") {
    return vscode.SymbolKind.Variable;
  }

  return vscode.SymbolKind.Namespace;
}
