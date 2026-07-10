import * as vscode from "vscode";

import {
  collectTwigBlockSymbols,
  collectTwigMacroImports,
  collectTwigStructureSymbols,
  getBlockReferenceAtOffset,
  getTwigMacroReferenceAtOffset,
  getTemplateReferenceMatch,
  getExtendsTemplateReference,
  resolveTemplateWorkspacePath
} from "@twig-plus/parser";

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
      const currentWorkspacePath = vscode.workspace
        .asRelativePath(document.uri, false)
        .replace(/\\/g, "/");

      const resolvedWorkspacePath = resolveTemplateWorkspacePath(
        relativePaths,
        match.prefix,
        currentWorkspacePath
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

  const uris = await vscode.workspace.findFiles(
    new vscode.RelativePattern(workspaceFolder, "**/*.twig"),
    "**/{node_modules,dist,coverage}/**"
  );
  const relativePaths = uris.map((uri) =>
    vscode.workspace.asRelativePath(uri, false).replace(/\\/g, "/")
  );
  const currentWorkspacePath = vscode.workspace
    .asRelativePath(document.uri, false)
    .replace(/\\/g, "/");

  const resolvedWorkspacePath = resolveTemplateWorkspacePath(
    relativePaths,
    parentReference,
    currentWorkspacePath
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
  const uris = await vscode.workspace.findFiles(
    new vscode.RelativePattern(workspaceFolder, "**/*.twig"),
    "**/{node_modules,dist,coverage}/**"
  );
  const relativePaths = uris.map((uri) =>
    vscode.workspace.asRelativePath(uri, false).replace(/\\/g, "/")
  );
  const currentWorkspacePath = vscode.workspace
    .asRelativePath(document.uri, false)
    .replace(/\\/g, "/");

  const resolvedWorkspacePath = resolveTemplateWorkspacePath(
    relativePaths,
    referencePath,
    currentWorkspacePath
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
