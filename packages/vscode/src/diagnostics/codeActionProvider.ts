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
      for (const diagnostic of actionContext.diagnostics) {
        const match = diagnostic.code === "unclosed-tag" ? diagnostic.message.match(/Unclosed Twig tag "([A-Za-z_][\w]*)"/) : null;
        const closing = match ? closingTagFor(match[1]) : null;
        if (!closing) continue;
        const action = new vscode.CodeAction(`Insert {% ${closing} %}`, vscode.CodeActionKind.QuickFix);
        action.diagnostics = [diagnostic]; action.isPreferred = true;
        action.edit = new vscode.WorkspaceEdit();
        const prefix = document.getText().endsWith("\n") ? "" : "\n";
        action.edit.insert(document.uri, document.positionAt(document.getText().length), `${prefix}{% ${closing} %}`);
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

function closingTagFor(opening: string): string | null {
  return ({ if: "endif", for: "endfor", block: "endblock", embed: "endembed", macro: "endmacro", with: "endwith", apply: "endapply", autoescape: "endautoescape", cache: "endcache", guard: "endguard", sandbox: "endsandbox", set: "endset", types: "endtypes", verbatim: "endverbatim" } as Record<string, string>)[opening] ?? null;
}

function normalizeDelimiterSpacing(source: string): string {
  return source.replace(/\{\{[-~]?[\s\S]*?[-~]?\}\}|\{%[-~]?[\s\S]*?[-~]?%\}|\{#[-~]?[\s\S]*?[-~]?#\}/g, (token) => {
    const openingLength = token[2] === "-" || token[2] === "~" ? 3 : 2;
    const closingLength = /[-~][%#}]}$/.test(token) ? 3 : 2;
    return `${token.slice(0, openingLength)} ${token.slice(openingLength, -closingLength).trim()} ${token.slice(-closingLength)}`;
  });
}
