import * as vscode from "vscode";

import {
  collectTwigBlockSymbols,
  collectTwigMacroImports,
  collectTwigStructureSymbols,
  getBlockReferenceAtOffset,
  getTwigMacroReferenceAtOffset,
  getTemplateReferenceAtOffset,
  getExtendsTemplateReference,
  resolveTemplateWorkspacePath
} from "@twig-plus/parser";
import {
  findTwigWorkspacePaths,
  getConfiguredTemplateRoots
} from "./templateConfig";

export function registerTwigDefinitionProvider(
  context: vscode.ExtensionContext
): void {
  const provider: vscode.DefinitionProvider = {
    async provideDefinition(document, position) {
      const macroDefinition = await provideMacroDefinition(document, position);
      if (macroDefinition) {
        return macroDefinition;
      }

      const blockDefinition = await provideBlockDefinition(document, position);
      if (blockDefinition) {
        return blockDefinition;
      }

      const match = getTemplateReferenceAtOffset(
        document.getText(),
        document.offsetAt(position)
      );

      if (!match) {
        return null;
      }

      const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
      if (!workspaceFolder) {
        return null;
      }

      const relativePaths = await findTwigWorkspacePaths(workspaceFolder);
      const currentWorkspacePath = vscode.workspace
        .asRelativePath(document.uri, false)
        .replace(/\\/g, "/");
      const templateRoots = getConfiguredTemplateRoots();

      const resolvedWorkspacePath = resolveTemplateWorkspacePath(
        relativePaths,
        match.referencePath,
        currentWorkspacePath,
        templateRoots
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

  if (blockReference.kind !== "block") {
    return new vscode.Location(
      document.uri,
      new vscode.Position(
        document.positionAt(blockReference.nameStart).line,
        document.positionAt(blockReference.nameStart).character
      )
    );
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

  const relativePaths = await findTwigWorkspacePaths(workspaceFolder);
  const currentWorkspacePath = vscode.workspace
    .asRelativePath(document.uri, false)
    .replace(/\\/g, "/");
  const templateRoots = getConfiguredTemplateRoots();

  const resolvedWorkspacePath = resolveTemplateWorkspacePath(
    relativePaths,
    parentReference,
    currentWorkspacePath,
    templateRoots
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

  const targetDocument = await vscode.workspace.openTextDocument(targetUri);
  return new vscode.Location(targetUri, targetDocument.positionAt(targetBlock.nameStart));
}

async function provideMacroDefinition(
  document: vscode.TextDocument,
  position: vscode.Position
): Promise<vscode.Location | null> {
  const source = document.getText();
  const offset = document.offsetAt(position);
  const macroReference = getTwigMacroReferenceAtOffset(source, offset);

  if (!macroReference) {
    return null;
  }

  if (macroReference.kind === "self") {
    return findMacroLocation(document, document.uri, source, macroReference.name);
  }

  const macroImports = collectTwigMacroImports(source);
  const matchingImport =
    macroReference.kind === "import"
      ? macroImports.find((entry) => entry.kind === "import" && entry.alias === macroReference.alias)
      : macroImports.find(
          (entry) => entry.kind === "from" && entry.localName === macroReference.name
        );

  if (!matchingImport) {
    return null;
  }

  const targetMacroName =
    matchingImport.kind === "from"
      ? matchingImport.exportedName
      : macroReference.name;

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (!workspaceFolder) {
    return null;
  }

  const targetUri = await resolveTemplateUri(
    workspaceFolder,
    document,
    matchingImport.template
  );
  if (!targetUri) {
    return null;
  }

  const targetSource = Buffer.from(await vscode.workspace.fs.readFile(targetUri)).toString(
    "utf8"
  );

  return findMacroLocation(document, targetUri, targetSource, targetMacroName);
}

async function resolveTemplateUri(
  workspaceFolder: vscode.WorkspaceFolder,
  document: vscode.TextDocument,
  referencePath: string
): Promise<vscode.Uri | null> {
  const relativePaths = await findTwigWorkspacePaths(workspaceFolder);
  const currentWorkspacePath = vscode.workspace
    .asRelativePath(document.uri, false)
    .replace(/\\/g, "/");
  const templateRoots = getConfiguredTemplateRoots();

  const resolvedWorkspacePath = resolveTemplateWorkspacePath(
    relativePaths,
    referencePath,
    currentWorkspacePath,
    templateRoots
  );

  if (!resolvedWorkspacePath) {
    return null;
  }

  return vscode.Uri.joinPath(workspaceFolder.uri, resolvedWorkspacePath);
}

async function findMacroLocation(
  currentDocument: vscode.TextDocument,
  targetUri: vscode.Uri,
  source: string,
  macroName: string
): Promise<vscode.Location | null> {
  const targetMacro = collectTwigStructureSymbols(source).find(
    (symbol) => symbol.kind === "macro" && symbol.name === macroName
  );

  if (!targetMacro) {
    return null;
  }

  const targetDocument =
    currentDocument.uri.toString() === targetUri.toString()
      ? currentDocument
      : await vscode.workspace.openTextDocument(targetUri);

  return new vscode.Location(targetUri, targetDocument.positionAt(targetMacro.nameStart));
}
