import * as vscode from "vscode";

import {
  collectTwigBlockSymbols,
  getBlockReferenceAtOffset,
  getExtendsTemplateReference
} from "./blockAnalysis";
import {
  getTemplateReferenceMatch,
  resolveTemplateWorkspacePath
} from "../project/templateCompletion";

export function registerTwigDefinitionProvider(
  context: vscode.ExtensionContext
): void {
  const provider: vscode.DefinitionProvider = {
    async provideDefinition(document, position) {
      const blockDefinition = await provideBlockDefinition(document, position);
      if (blockDefinition) {
        return blockDefinition;
      }

      const line = document.lineAt(position.line).text;
      const linePrefix = line.slice(0, position.character);
      const match = getTemplateReferenceMatch(linePrefix);

      if (!match || !isInsideTemplateReference(line, position.character, match.prefix)) {
        return null;
      }

      const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
      if (!workspaceFolder) {
        return null;
      }

      const uris = await vscode.workspace.findFiles(
        new vscode.RelativePattern(workspaceFolder, "**/*.twig"),
        "**/{node_modules,dist,coverage}/**"
      );

      const relativePaths = uris.map((uri) =>
        vscode.workspace.asRelativePath(uri, false).replace(/\\/g, "/")
      );

      const resolvedWorkspacePath = resolveTemplateWorkspacePath(
        relativePaths,
        match.prefix
      );

      if (!resolvedWorkspacePath) {
        return null;
      }

      const targetUri = vscode.Uri.joinPath(workspaceFolder.uri, resolvedWorkspacePath);
      return new vscode.Location(targetUri, new vscode.Position(0, 0));
    }
  };

  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider({ language: "twig" }, provider)
  );
}

function isInsideTemplateReference(
  line: string,
  character: number,
  prefix: string
): boolean {
  const prefixStart = character - prefix.length;
  if (prefixStart < 0) {
    return false;
  }

  const suffix = line.slice(character);
  return /^[^'"]*['"]/.test(suffix) || suffix.length === 0;
}

async function provideBlockDefinition(
  document: vscode.TextDocument,
  position: vscode.Position
): Promise<vscode.Location | null> {
  const source = document.getText();
  const offset = document.offsetAt(position);
  const blockReference = getBlockReferenceAtOffset(source, offset);

  if (!blockReference) {
    return null;
  }

  const parentReference = getExtendsTemplateReference(source);
  if (!parentReference) {
    return new vscode.Location(
      document.uri,
      new vscode.Position(
        document.positionAt(blockReference.nameStart).line,
        document.positionAt(blockReference.nameStart).character
      )
    );
  }

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (!workspaceFolder) {
    return null;
  }

  const uris = await vscode.workspace.findFiles(
    new vscode.RelativePattern(workspaceFolder, "**/*.twig"),
    "**/{node_modules,dist,coverage}/**"
  );
  const relativePaths = uris.map((uri) =>
    vscode.workspace.asRelativePath(uri, false).replace(/\\/g, "/")
  );

  const resolvedWorkspacePath = resolveTemplateWorkspacePath(
    relativePaths,
    parentReference
  );

  if (!resolvedWorkspacePath) {
    return null;
  }

  const targetUri = vscode.Uri.joinPath(workspaceFolder.uri, resolvedWorkspacePath);
  const targetSource = Buffer.from(await vscode.workspace.fs.readFile(targetUri)).toString(
    "utf8"
  );
  const targetBlock = collectTwigBlockSymbols(targetSource).find(
    (symbol) => symbol.name === blockReference.name
  );

  if (!targetBlock) {
    return null;
  }

  const targetPosition = document.positionAt(0);
  const targetDocument = await vscode.workspace.openTextDocument(targetUri);
  const positionAtBlock = targetDocument.positionAt(targetBlock.nameStart);

  return new vscode.Location(targetUri, positionAtBlock ?? targetPosition);
}
