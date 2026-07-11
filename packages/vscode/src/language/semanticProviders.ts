import * as vscode from "vscode";
import { createWorkspaceModel, resolveTemplateWorkspacePath, type WorkspaceModel } from "@twig-plus/parser";
import { getCachedDocumentModel } from "./parserRuntime";
import { findTwigWorkspacePaths, getConfiguredTemplateRoots } from "./templateConfig";
import { TWIG_DOCUMENT_SELECTOR } from "./documentSelector";

export function registerTwigSemanticProviders(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerReferenceProvider(TWIG_DOCUMENT_SELECTOR, {
      async provideReferences(document, position, options) {
        const workspace = await getWorkspaceModel(document);
        if (workspace) {
          const locations = workspace.model.findReferences(document.uri.toString(), document.offsetAt(position), options.includeDeclaration);
          if (locations.length) return Promise.all(locations.map(async (location) => {
            const target = await vscode.workspace.openTextDocument(vscode.Uri.parse(location.uri));
            return new vscode.Location(target.uri, new vscode.Range(target.positionAt(location.start), target.positionAt(location.end)));
          }));
        }
        const target = getTarget(document, position);
        if (!target) return [];
        const locations = target.model.findReferences(target.symbol).map((reference) =>
          new vscode.Location(document.uri, new vscode.Range(document.positionAt(reference.start), document.positionAt(reference.end)))
        );
        if (options.includeDeclaration) locations.unshift(new vscode.Location(document.uri, new vscode.Range(document.positionAt(target.symbol.nameRange.start), document.positionAt(target.symbol.nameRange.end))));
        return locations;
      }
    }),
    vscode.languages.registerRenameProvider(TWIG_DOCUMENT_SELECTOR, {
      prepareRename(document, position) {
        const target = getTarget(document, position);
        if (target) return new vscode.Range(document.positionAt(target.symbol.nameRange.start), document.positionAt(target.symbol.nameRange.end));
        const reference = getCachedDocumentModel(document)?.getReferenceAt(document.offsetAt(position));
        if (reference?.role === "call") return new vscode.Range(document.positionAt(reference.start), document.positionAt(reference.end));
        throw new Error("No renameable Twig symbol at the cursor.");
      },
      async provideRenameEdits(document, position, newName) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(newName)) throw new Error("Twig names must be valid identifiers.");
        const edit = new vscode.WorkspaceEdit();
        const workspace = await getWorkspaceModel(document);
        const crossFileLocations = workspace?.model.findReferences(document.uri.toString(), document.offsetAt(position), true) ?? [];
        if (crossFileLocations.length > 1) {
          for (const location of crossFileLocations) {
            const uri = vscode.Uri.parse(location.uri);
            const targetDocument = await vscode.workspace.openTextDocument(uri);
            edit.replace(uri, new vscode.Range(targetDocument.positionAt(location.start), targetDocument.positionAt(location.end)), newName);
          }
          return edit;
        }
        const target = getTarget(document, position);
        if (!target) return null;
        const conflict = target.model.getVisibleSymbolsAt(target.symbol.start).find((symbol) => symbol.name === newName && symbol.id !== target.symbol.id);
        if (conflict) throw new Error(`A visible Twig symbol named '${newName}' already exists.`);
        edit.replace(document.uri, new vscode.Range(document.positionAt(target.symbol.nameRange.start), document.positionAt(target.symbol.nameRange.end)), newName);
        for (const reference of target.model.findReferences(target.symbol)) edit.replace(document.uri, new vscode.Range(document.positionAt(reference.start), document.positionAt(reference.end)), newName);
        return edit;
      }
    })
  );
}

async function getWorkspaceModel(document: vscode.TextDocument): Promise<{ model: WorkspaceModel } | null> {
  const folder = vscode.workspace.getWorkspaceFolder(document.uri); if (!folder) return null;
  const paths = await findTwigWorkspacePaths(folder);
  const inputs = await Promise.all(paths.map(async (path) => {
    const uri = vscode.Uri.joinPath(folder.uri, path);
    const source = uri.toString() === document.uri.toString()
      ? document.getText()
      : Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8");
    return { uri: uri.toString(), source };
  }));
  const roots = getConfiguredTemplateRoots();
  return { model: createWorkspaceModel(inputs, (fromUri, reference) => {
    const from = vscode.Uri.parse(fromUri);
    const current = vscode.workspace.asRelativePath(from, false).replace(/\\/g, "/");
    const resolved = resolveTemplateWorkspacePath(paths, reference, current, roots);
    return resolved ? vscode.Uri.joinPath(folder.uri, resolved).toString() : null;
  }) };
}

function getTarget(document: vscode.TextDocument, position: vscode.Position) {
  const model = getCachedDocumentModel(document);
  if (!model) return null;
  const offset = document.offsetAt(position);
  const direct = model.getSymbolAt(offset);
  const reference = model.getReferenceAt(offset);
  const symbol = direct ?? (reference?.resolvedSymbolId ? model.symbols.find((item) => item.id === reference.resolvedSymbolId) : undefined);
  return symbol ? { model, symbol } : null;
}
