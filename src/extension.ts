import * as vscode from "vscode";

import { registerTwigDiagnosticProvider } from "./diagnostics/diagnosticProvider";
import { formatTwigDocument } from "./formatter/formatTwigDocument";
import { registerTwigCompletionProvider } from "./language/completionProvider";
import { registerTwigDefinitionProvider } from "./language/definitionProvider";
import { registerTwigDocumentSymbolProvider } from "./language/documentSymbolProvider";

export function activate(context: vscode.ExtensionContext): void {
  const provider: vscode.DocumentFormattingEditProvider = {
    async provideDocumentFormattingEdits(document) {
      const config = vscode.workspace.getConfiguration("twigPlus");
      const enabled = config.get<boolean>("format.enable", true);

      if (!enabled) {
        return [];
      }

      const source = document.getText();
      const formatted = await formatTwigDocument(source, {
        indentSize: config.get<number>("format.indentSize", 2),
        printWidth: config.get<number>("format.printWidth", 100),
        useTabs: config.get<boolean>("format.useTabs", false),
        twigTagSpacing: config.get<boolean>("format.twigTagSpacing", true),
        htmlAttributeWrap: config.get<"preserve" | "auto" | "force">(
          "format.htmlAttributeWrap",
          "auto"
        ),
        preserveSingleLineBlocks: config.get<boolean>(
          "format.preserveSingleLineBlocks",
          true
        )
      });

      if (formatted === source) {
        return [];
      }

      const lastLine = document.lineAt(document.lineCount - 1);
      const range = new vscode.Range(
        new vscode.Position(0, 0),
        lastLine.range.end
      );

      return [vscode.TextEdit.replace(range, formatted)];
    }
  };

  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider(
      { language: "twig" },
      provider
    )
  );

  registerTwigCompletionProvider(context);
  registerTwigDefinitionProvider(context);
  registerTwigDocumentSymbolProvider(context);
  registerTwigDiagnosticProvider(context);
}

export function deactivate(): void {}
