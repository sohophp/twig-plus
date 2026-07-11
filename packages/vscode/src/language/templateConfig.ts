import * as vscode from "vscode";
import { DEFAULT_TEMPLATE_ROOTS } from "@twig-plus/parser";

export function getConfiguredTemplateRoots(): string[] {
  const config = vscode.workspace.getConfiguration("twigPlus");
  const configuredRoots = config.get<string[]>("templates.roots", [
    ...DEFAULT_TEMPLATE_ROOTS
  ]);

  return configuredRoots.length > 0 ? configuredRoots : [...DEFAULT_TEMPLATE_ROOTS];
}

export async function findTwigWorkspacePaths(
  workspaceFolder: vscode.WorkspaceFolder
): Promise<string[]> {
  const uris = await vscode.workspace.findFiles(
    new vscode.RelativePattern(workspaceFolder, "**/*.twig"),
    "**/{node_modules,dist,coverage}/**"
  );

  return uris.map((uri) =>
    vscode.workspace.asRelativePath(uri, false).replace(/\\/g, "/")
  );
}
