import * as vscode from "vscode";
import { formatTwig, type FormatterOptions } from "@twig-plus/formatter";
import { registerTwigDiagnosticProvider } from "../diagnostics/diagnosticProvider";
import { registerTwigDefinitionProvider } from "./definitionProvider";
import { registerTwigDocumentSymbolProvider } from "./documentSymbolProvider";
import { registerTwigSelectionRangeProvider } from "./selectionRangeProvider";
import { registerTwigSemanticProviders } from "./semanticProviders";
import { getConfiguredParserEngine, reportHybridDifference } from "./parserRuntime";
import { TWIG_DOCUMENT_SELECTOR } from "./documentSelector";

/** Keep core editing usable when the bundled language server cannot start. */
export function registerFallbackProviders(context: vscode.ExtensionContext): void {
  registerTwigDefinitionProvider(context);
  registerTwigDocumentSymbolProvider(context);
  registerTwigSelectionRangeProvider(context);
  registerTwigSemanticProviders(context);
  registerTwigDiagnosticProvider(context);
  context.subscriptions.push(vscode.languages.registerDocumentFormattingEditProvider(TWIG_DOCUMENT_SELECTOR, {
    async provideDocumentFormattingEdits(document) {
      const config = vscode.workspace.getConfiguration("twigPlus", document.uri);
      if (!config.get<boolean>("format.enable", true)) return [];
      const options: FormatterOptions = {
        profile: config.get<"phpstorm" | "compact">("format.profile", "phpstorm"),
        indentSize: config.get<number>("format.indentSize", 4),
        printWidth: config.get<number>("format.printWidth", 100),
        useTabs: config.get<boolean>("format.useTabs", false),
        twigTagSpacing: config.get<boolean>("format.twigTagSpacing", true),
        htmlAttributeWrap: config.get<"preserve" | "auto" | "force">("format.htmlAttributeWrap", "auto"),
        preserveSingleLineBlocks: config.get<boolean>("format.preserveSingleLineBlocks", true),
        lineBreakAfterTwigControlTag: config.get<boolean>("format.lineBreakAfterTwigControlTag", true),
        parserEngine: getConfiguredParserEngine(),
        onHybridDifference: (difference) => reportHybridDifference(difference, document)
      };
      const source = document.getText();
      const formatted = await formatTwig(source, options);
      if (formatted === source) return [];
      return [vscode.TextEdit.replace(new vscode.Range(new vscode.Position(0, 0), document.positionAt(source.length)), formatted)];
    }
  }));
}
