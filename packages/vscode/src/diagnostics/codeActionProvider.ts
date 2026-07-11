import * as vscode from "vscode";
import { TWIG_DOCUMENT_SELECTOR } from "../language/documentSelector";

export function registerTwigCodeActionProvider(
  context: vscode.ExtensionContext
): void {
  const provider: vscode.CodeActionProvider = {
    provideCodeActions(_document, _range, actionContext) {
      const hasTemplateRootDiagnostic = actionContext.diagnostics.some(
        (diagnostic) =>
          diagnostic.source === "TwigPlus" &&
          diagnostic.message.includes("twigPlus.templates.roots")
      );

      if (!hasTemplateRootDiagnostic) {
        return [];
      }

      const action = new vscode.CodeAction(
        "Open TwigPlus template roots setting",
        vscode.CodeActionKind.QuickFix
      );
      action.command = {
        title: "Open TwigPlus template roots setting",
        command: "workbench.action.openSettings",
        arguments: ["twigPlus.templates.roots"]
      };

      return [action];
    }
  };

  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(TWIG_DOCUMENT_SELECTOR, provider, {
      providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
    })
  );
}
