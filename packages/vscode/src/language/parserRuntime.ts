import * as vscode from "vscode";
import { createDocumentModel, parseHybridDocument, validateHybridDocument, type DocumentModel, type HybridDifference, type HybridDocument, type HybridQueryOptions, type ParserEngine } from "@twig-plus/parser";

let outputChannel: vscode.OutputChannel | null = null;
const documentCache = new Map<string, { version: number; document: HybridDocument; model?: DocumentModel }>();
const MAX_HYBRID_SOURCE_LENGTH = 2_000_000;

export function registerHybridParserRuntime(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel("TwigPlus");
  context.subscriptions.push(
    outputChannel,
    vscode.workspace.onDidCloseTextDocument((document) => documentCache.delete(document.uri.toString())),
    vscode.workspace.onDidChangeTextDocument((event) => documentCache.delete(event.document.uri.toString()))
  );
}

export function getConfiguredParserEngine(): ParserEngine {
  return vscode.workspace.getConfiguration("twigPlus.parser").get<ParserEngine>("engine", "hybrid");
}

export function getParserQueryOptions(document?: vscode.TextDocument): HybridQueryOptions {
  const engine = getConfiguredParserEngine();
  return {
    engine,
    hybridDocument: engine !== "legacy" && document ? getCachedHybridDocument(document) ?? undefined : undefined,
    onDifference: (difference) => reportHybridDifference(difference, document)
  };
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
    if (Date.now() - started > 100 || validateHybridDocument(hybridDocument).length > 0) return null;
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

export function reportHybridDifference(difference: HybridDifference, document?: vscode.TextDocument): void {
  const file = document?.uri.fsPath || document?.uri.toString() || "(unknown document)";
  const position = document?.positionAt(difference.range.start);
  const location = position ? `line ${position.line + 1}, column ${position.character + 1}` : `offset ${difference.range.start}`;
  const summaries = difference.legacySummary || difference.hybridSummary
    ? `; legacy=${difference.legacySummary ?? "missing"}; hybrid=${difference.hybridSummary ?? "missing"}`
    : "";
  outputChannel?.appendLine(`[hybrid-shadow] ${difference.query}: ${difference.reason}; ${file}; ${location}; offsets ${difference.range.start}-${difference.range.end}${summaries}`);
}

export function reportRuntimeError(message: string, error: unknown): void {
  const detail = error instanceof Error ? error.stack ?? error.message : String(error);
  outputChannel?.appendLine(`[error] ${message}: ${detail}`);
}
