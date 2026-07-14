import * as vscode from "vscode";
import { TWIG_DOCUMENT_SELECTOR } from "../language/documentSelector";

export function registerTwigCodeActionProvider(
  context: vscode.ExtensionContext
): void {
  const provider: vscode.CodeActionProvider = {
    provideCodeActions(document, range, actionContext) {
      const actions: vscode.CodeAction[] = [];
      const hasTemplateRootDiagnostic = actionContext.diagnostics.some(
        (diagnostic) =>
          diagnostic.source === "TwigPlus" &&
          diagnostic.message.includes("twigPlus.templates.roots")
      );

      if (hasTemplateRootDiagnostic) {
        const action = new vscode.CodeAction("Open TwigPlus template roots setting", vscode.CodeActionKind.QuickFix);
        action.command = { title: action.title, command: "workbench.action.openSettings", arguments: ["twigPlus.templates.roots"] };
        actions.push(action);
      }
      const selected = document.getText(range);
      const normalized = normalizeDelimiterSpacing(selected);
      if (normalized !== selected) {
        const action = new vscode.CodeAction("Normalize Twig delimiter spacing", vscode.CodeActionKind.QuickFix);
        action.edit = new vscode.WorkspaceEdit(); action.edit.replace(document.uri, range, normalized); actions.push(action);
      }
      return actions;
    }
  };

  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(TWIG_DOCUMENT_SELECTOR, provider, {
      providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
    })
  );
}

function normalizeDelimiterSpacing(source: string): string {
  return source.replace(/\{\{[-~]?[\s\S]*?[-~]?\}\}|\{%[-~]?[\s\S]*?[-~]?%\}|\{#[-~]?[\s\S]*?[-~]?#\}/g, (token) => {
    const openingLength = token[2] === "-" || token[2] === "~" ? 3 : 2;
    const closingLength = /[-~][%#}]}$/.test(token) ? 3 : 2;
    return `${token.slice(0, openingLength)} ${token.slice(openingLength, -closingLength).trim()} ${token.slice(-closingLength)}`;
  });
}
