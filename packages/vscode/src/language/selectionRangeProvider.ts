import * as vscode from "vscode";
import { TWIG_DOCUMENT_SELECTOR } from "./documentSelector";

import { collectHybridSelectionRanges } from "@twig-plus/parser";
import { getCachedHybridDocument } from "./parserRuntime";

export function registerTwigSelectionRangeProvider(
  context: vscode.ExtensionContext
): void {
  const provider: vscode.SelectionRangeProvider = {
    provideSelectionRanges(document, positions) {
      return positions.map((position) =>
        buildSelectionRangeTree(document, position)
      );
    }
  };

  context.subscriptions.push(
    vscode.languages.registerSelectionRangeProvider(
      TWIG_DOCUMENT_SELECTOR,
      provider
    )
  );
}

function buildSelectionRangeTree(
  document: vscode.TextDocument,
  position: vscode.Position
): vscode.SelectionRange {
  const syntax = getCachedHybridDocument(document);
  const ranges = syntax ? collectHybridSelectionRanges(syntax, document.offsetAt(position)) : [];

  let parent: vscode.SelectionRange | undefined;

  for (let index = ranges.length - 1; index >= 0; index -= 1) {
    const range = ranges[index];
    parent = new vscode.SelectionRange(
      new vscode.Range(
        document.positionAt(range.start),
        document.positionAt(range.end)
      ),
      parent
    );
  }

  return (
    parent ??
    new vscode.SelectionRange(new vscode.Range(position, position))
  );
}
