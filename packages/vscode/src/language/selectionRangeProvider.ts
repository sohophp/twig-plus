import * as vscode from "vscode";

import { collectSelectionRanges } from "@twig-plus/parser";

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
      { language: "twig" },
      provider
    )
  );
}

function buildSelectionRangeTree(
  document: vscode.TextDocument,
  position: vscode.Position
): vscode.SelectionRange {
  const source = document.getText();
  const ranges = collectSelectionRanges(source, document.offsetAt(position));

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
