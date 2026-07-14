import * as vscode from "vscode";
import { createDocumentModel, parseHybridDocument, type DocumentModel, type HybridDocument, type HybridQueryFailure } from "@twig-plus/parser";
import { getTwigPlusOutput } from "../output";

const documentCache = new Map<string, { version: number; document: HybridDocument; model?: DocumentModel }>();
const MAX_HYBRID_SOURCE_LENGTH = 2_000_000;

export function registerHybridParserRuntime(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((document) => documentCache.delete(document.uri.toString())),
    vscode.workspace.onDidChangeTextDocument((event) => documentCache.delete(event.document.uri.toString()))
  );
}

export function getCachedHybridDocument(document: vscode.TextDocument): HybridDocument | null {
  const source = document.getText();
  if (source.length > MAX_HYBRID_SOURCE_LENGTH) return null;
  const key = document.uri.toString();
  const cached = documentCache.get(key);
  if (cached?.version === document.version && cached.document.source === source) return cached.document;
  const started = Date.now();
  try {
    const hybridDocument = parseHybridDocument(source);
    if (Date.now() - started > 100) return null;
    documentCache.set(key, { version: document.version, document: hybridDocument });
    return hybridDocument;
  } catch {
    return null;
  }
}

export function getCachedDocumentModel(document: vscode.TextDocument): DocumentModel | null {
  const syntax = getCachedHybridDocument(document);
  if (!syntax) return null;
  const key = document.uri.toString();
  const cached = documentCache.get(key);
  if (cached?.model) return cached.model;
  const model = createDocumentModel(syntax);
  documentCache.set(key, { version: document.version, document: syntax, model });
  return model;
}

export function reportHybridFailure(difference: HybridQueryFailure, document?: vscode.TextDocument): void {
  const file = document?.uri.fsPath || document?.uri.toString() || "(unknown document)";
  const position = document?.positionAt(difference.range.start);
  const location = position ? `line ${position.line + 1}, column ${position.character + 1}` : `offset ${difference.range.start}`;
  const message = difference.message ? `; ${difference.message}` : "";
  getTwigPlusOutput().appendLine(`[hybrid-failure] ${difference.query}: ${difference.reason}; ${file}; ${location}; offsets ${difference.range.start}-${difference.range.end}${message}`);
}

export function reportRuntimeError(message: string, error: unknown): void {
  const detail = error instanceof Error ? error.stack ?? error.message : String(error);
  getTwigPlusOutput().appendLine(`[error] ${message}: ${detail}`);
}
