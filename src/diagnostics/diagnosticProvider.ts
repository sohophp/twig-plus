import * as vscode from "vscode";

import {
  analyzeTwigDiagnostics,
  type TwigDiagnostic,
  type TwigDiagnosticSeverity
} from "./twigDiagnostics";

export function registerTwigDiagnosticProvider(
  context: vscode.ExtensionContext
): void {
  const collection = vscode.languages.createDiagnosticCollection("twigPlus");

  const refreshDiagnostics = async (document: vscode.TextDocument): Promise<void> => {
    if (document.languageId !== "twig") {
      return;
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    const workspacePaths = workspaceFolder
      ? (
          await vscode.workspace.findFiles(
            new vscode.RelativePattern(workspaceFolder, "**/*.twig"),
            "**/{node_modules,dist,coverage}/**"
          )
        ).map((uri) => vscode.workspace.asRelativePath(uri, false).replace(/\\/g, "/"))
      : [];

    const diagnostics = analyzeTwigDiagnostics(document.getText(), workspacePaths).map(
      (diagnostic) => toVsCodeDiagnostic(document, diagnostic)
    );

    collection.set(document.uri, diagnostics);
  };

  if (vscode.window.activeTextEditor) {
    void refreshDiagnostics(vscode.window.activeTextEditor.document);
  }

  context.subscriptions.push(
    collection,
    vscode.workspace.onDidOpenTextDocument((document) => {
      void refreshDiagnostics(document);
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      void refreshDiagnostics(event.document);
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      collection.delete(document.uri);
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        void refreshDiagnostics(editor.document);
      }
    })
  );
}

function toVsCodeDiagnostic(
  document: vscode.TextDocument,
  diagnostic: TwigDiagnostic
): vscode.Diagnostic {
  const range = new vscode.Range(
    document.positionAt(diagnostic.start),
    document.positionAt(diagnostic.end)
  );
  const result = new vscode.Diagnostic(
    range,
    diagnostic.message,
    mapSeverity(diagnostic.severity)
  );
  result.source = "TwigPlus";
  return result;
}

function mapSeverity(
  severity: TwigDiagnosticSeverity
): vscode.DiagnosticSeverity {
  if (severity === "error") {
    return vscode.DiagnosticSeverity.Error;
  }

  if (severity === "warning") {
    return vscode.DiagnosticSeverity.Warning;
  }

  return vscode.DiagnosticSeverity.Hint;
}
