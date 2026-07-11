import * as vscode from "vscode";
import { TWIG_DOCUMENT_SELECTOR } from "./documentSelector";

import {
  collectCompatibleBlockSymbols,
  collectCompatibleMacroImports,
  collectCompatibleStructureSymbols,
  getCompatibleBlockReferenceAtOffset,
  getCompatibleMacroReferenceAtOffset,
  getTemplateReferenceAtOffset,
  getCompatibleExtendsTemplateReference,
  resolveTemplateWorkspacePath
} from "@twig-plus/parser";
import {
  findTwigWorkspacePaths,
  getConfiguredTemplateRoots
} from "./templateConfig";
import { getCachedDocumentModel, getParserQueryOptions } from "./parserRuntime";

export function registerTwigDefinitionProvider(
  context: vscode.ExtensionContext
): void {
  const provider: vscode.DefinitionProvider = {
    async provideDefinition(document, position) {
      const localDefinition = provideLocalDefinition(document, position);
      if (localDefinition) return localDefinition;
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
    vscode.languages.registerDefinitionProvider(TWIG_DOCUMENT_SELECTOR, provider)
  );
}

function provideLocalDefinition(document: vscode.TextDocument, position: vscode.Position): vscode.Location | null {
  const model = getCachedDocumentModel(document);
  if (!model) return null;
  const offset = document.offsetAt(position);
  const direct = model.getSymbolAt(offset);
  const reference = model.getReferenceAt(offset);
  const symbol = direct ?? (reference?.resolvedSymbolId ? model.symbols.find((item) => item.id === reference.resolvedSymbolId) : undefined);
  return symbol ? new vscode.Location(document.uri, document.positionAt(symbol.nameRange.start)) : null;
}

async function provideBlockDefinition(
  document: vscode.TextDocument,
  position: vscode.Position
): Promise<vscode.Location | null> {
  const source = document.getText();
  const offset = document.offsetAt(position);
  const blockReference = getCompatibleBlockReferenceAtOffset(source, offset, getParserQueryOptions(document));

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

  const parentReference = getCompatibleExtendsTemplateReference(source, getParserQueryOptions(document));
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
  const targetBlock = collectCompatibleBlockSymbols(targetSource, getParserQueryOptions()).find(
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
  const macroReference = getCompatibleMacroReferenceAtOffset(source, offset, getParserQueryOptions(document));

  if (!macroReference) {
    return null;
  }

  if (macroReference.kind === "self") {
    return findMacroLocation(document, document.uri, source, macroReference.name);
  }

  const macroImports = collectCompatibleMacroImports(source, getParserQueryOptions(document));
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
  const targetMacro = collectCompatibleStructureSymbols(source, getParserQueryOptions(currentDocument)).find(
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
