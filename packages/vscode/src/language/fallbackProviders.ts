import * as vscode from "vscode";
import { formatTwigWithResult, type FormatterOptions } from "@twig-plus/formatter";
import { registerTwigDiagnosticProvider } from "../diagnostics/diagnosticProvider";
import { registerTwigDefinitionProvider } from "./definitionProvider";
import { registerTwigDocumentSymbolProvider } from "./documentSymbolProvider";
import { registerTwigSelectionRangeProvider } from "./selectionRangeProvider";
import { registerTwigSemanticProviders } from "./semanticProviders";
import { reportHybridFailure } from "./parserRuntime";
import { TWIG_DOCUMENT_SELECTOR } from "./documentSelector";

/** Keep core editing usable when the bundled language server cannot start. */
export function registerFallbackProviders(context: vscode.ExtensionContext): void {
  registerTwigDefinitionProvider(context);
  registerTwigDocumentSymbolProvider(context);
  registerTwigSelectionRangeProvider(context);
  registerTwigSemanticProviders(context);
  registerTwigDiagnosticProvider(context);
  context.subscriptions.push(vscode.languages.registerDocumentFormattingEditProvider(TWIG_DOCUMENT_SELECTOR, {
    async provideDocumentFormattingEdits(document, _options, cancellation) {
      const config = vscode.workspace.getConfiguration("twigPlus", document.uri);
      if (!config.get<boolean>("format.enable", true)) return [];
      const options: FormatterOptions = {
        profile: config.get<"phpstorm" | "compact">("format.profile", "phpstorm"),
        indentSize: config.get<number>("format.indentSize", 2),
        printWidth: config.get<number>("format.printWidth", 100),
        useTabs: config.get<boolean>("format.useTabs", false),
        twigTagSpacing: config.get<boolean>("format.twigTagSpacing", true),
        htmlAttributeWrap: config.get<"preserve" | "auto" | "force">("format.htmlAttributeWrap", "auto"),
        preserveSingleLineBlocks: config.get<boolean>("format.preserveSingleLineBlocks", true),
        lineBreakAfterTwigControlTag: config.get<boolean>("format.lineBreakAfterTwigControlTag", true),
        onHybridFailure: (failure) => reportHybridFailure(failure, document),
        onEmbeddedSyntaxError: (error) => {
          void vscode.window.showWarningMessage(
            `TwigPlus skipped formatting because the embedded ${error.language} contains syntax errors.`
          );
        }
      };
      const source = document.getText();
      const result = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Window, title: "TwigPlus: formatting document" },
        async (progress) => formatTwigWithResult(source, {
          ...options,
          isCancellationRequested: () => cancellation.isCancellationRequested,
          onStage: (stage, elapsedMs) => progress.report({ message: `${stage} ${elapsedMs.toFixed(1)}ms` })
        })
      );
      if (!result.ok) {
        if (result.error.code !== "cancelled") void vscode.window.showErrorMessage(`TwigPlus did not modify this document: ${result.error.message}`);
        return [];
      }
      if (result.text === source) return [];
      return [vscode.TextEdit.replace(new vscode.Range(new vscode.Position(0, 0), document.positionAt(source.length)), result.text)];
    }
  }));
}
