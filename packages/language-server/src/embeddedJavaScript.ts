import type ts from "typescript";
import {
  createEmbeddedScriptDocuments,
  type EmbeddedScriptDocument,
  type HybridDocument,
  type SourceRange
} from "@twig-plus/parser";

export interface EmbeddedCompletion {
  label: string;
  detail?: string;
  kind: string;
  sortText: string;
  replacement?: SourceRange;
  insertText?: string;
  snippet?: string;
}

export interface EmbeddedJavaScriptDiagnostic {
  range: SourceRange;
  message: string;
  code?: number;
}

interface CachedDocument {
  version: number;
  scripts: ScriptService[];
}

interface ScriptService {
  document: EmbeddedScriptDocument;
  fileName: string;
  service: ts.LanguageService;
}

type TypeScriptRuntime = typeof import("typescript");
let typescriptPromise: Promise<TypeScriptRuntime> | null = null;
let sharedDocumentRegistry: ts.DocumentRegistry | null = null;

export function isTypeScriptRuntimeLoaded(): boolean { return typescriptPromise !== null; }

export class EmbeddedJavaScriptService {
  private readonly cache = new Map<string, CachedDocument>();

  async getCompletions(uri: string, version: number, document: HybridDocument, originalOffset: number): Promise<EmbeddedCompletion[] | null> {
    const cached = await this.getDocument(uri, version, document);
    const script = cached.scripts.find((item) =>
      originalOffset >= item.document.sourceRange.start && originalOffset <= item.document.sourceRange.end);
    if (!script) return null;
    const generatedOffset = script.document.toGeneratedOffset(originalOffset);
    if (generatedOffset === null) return [];
    const completionContext = getCompletionContext(script.document.generatedSource, generatedOffset);
    if (completionContext.suppress) return [];
    const completions = script.service.getCompletionsAtPosition(script.fileName, generatedOffset, {
      includeCompletionsForModuleExports: false,
      includeCompletionsWithInsertText: true
    });
    return completions?.entries.flatMap((entry) => {
      if (completionContext.emptyMemberAccess && /^[A-Z][A-Z0-9_]+$/.test(entry.name)) return [];
      const span = entry.replacementSpan ?? identifierSpanAt(script.document.generatedSource, generatedOffset);
      const replacement = span
        ? script.document.toOriginalRange(span.start, span.start + span.length)
        : undefined;
      if (span && !replacement) return [];
      return [{
        label: entry.name,
        detail: entry.source ? `Auto import from ${entry.source}` : entry.kindModifiers || undefined,
        kind: entry.kind,
        sortText: `${completionKindPriority(entry.kind)}_${entry.sortText}_${entry.name.toLowerCase()}`,
        replacement: replacement ?? undefined,
        insertText: entry.insertText,
        snippet: isCallable(entry.kind) && !/^\s*\(/.test(script.document.generatedSource.slice(generatedOffset))
          ? `${entry.insertText ?? entry.name}(\${1})`
          : undefined
      }];
    }) ?? [];
  }

  delete(uri: string): void { this.cache.delete(uri); }

  async getDiagnostics(uri: string, version: number, document: HybridDocument): Promise<EmbeddedJavaScriptDiagnostic[]> {
    return (await this.getDocument(uri, version, document)).scripts.flatMap((script) =>
      script.service.getSyntacticDiagnostics(script.fileName).flatMap((diagnostic) => {
        if (diagnostic.start === undefined || diagnostic.length === undefined) return [];
        const range = script.document.toOriginalRange(diagnostic.start, diagnostic.start + diagnostic.length);
        if (!range) return [];
        return [{
          range,
          message: flattenDiagnosticMessage(diagnostic.messageText),
          code: diagnostic.code
        }];
      })
    );
  }

  private async getDocument(uri: string, version: number, document: HybridDocument): Promise<CachedDocument> {
    const current = this.cache.get(uri);
    if (current?.version === version) return current;
    const embeddedDocuments = createEmbeddedScriptDocuments(document);
    if (embeddedDocuments.length === 0) {
      const next = { version, scripts: [] };
      this.cache.set(uri, next);
      return next;
    }
    const runtime = await loadTypeScript();
    const scripts = embeddedDocuments.map((embedded, index) => createScriptService(runtime, uri, version, embedded, index));
    const next = { version, scripts };
    this.cache.set(uri, next);
    return next;
  }
}

function getCompletionContext(source: string, offset: number): { suppress: boolean; emptyMemberAccess: boolean } {
  const before = source.slice(0, offset);
  const trimmed = before.trimEnd();
  return {
    suppress: /=>\s*$/.test(before) || /=>\s*{\s*$/.test(before),
    emptyMemberAccess: /[\w$]+\.\s*$/.test(trimmed)
  };
}

function completionKindPriority(kind: string): string {
  if (kind === "method" || kind === "function" || kind === "construct" || kind === "call") return "0";
  if (kind === "property" || kind === "getter" || kind === "setter") return "1";
  return "2";
}

function isCallable(kind: string): boolean {
  return kind === "function" || kind === "method" || kind === "construct" || kind === "call";
}

function identifierSpanAt(source: string, offset: number): ts.TextSpan | undefined {
  let start = offset;
  while (start > 0 && /[\w$]/.test(source[start - 1])) start -= 1;
  return start === offset ? undefined : { start, length: offset - start };
}

function createScriptService(runtime: TypeScriptRuntime, uri: string, version: number, document: EmbeddedScriptDocument, index: number): ScriptService {
  const safeName = uri.replace(/[^A-Za-z0-9_.-]/g, "_");
  const sourceId = hashSource(document.generatedSource);
  const fileName = `/__twig_plus__/${safeName}.${version}.${index}.${sourceId}.${document.kind === "javascript-module" ? "mjs" : "js"}`;
  const options: ts.CompilerOptions = {
    allowJs: true,
    allowNonTsExtensions: true,
    target: runtime.ScriptTarget.ES2022,
    module: document.kind === "javascript-module" ? runtime.ModuleKind.ESNext : runtime.ModuleKind.None,
    moduleResolution: runtime.ModuleResolutionKind.Node10,
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts"]
  };
  const host: ts.LanguageServiceHost = {
    getCompilationSettings: () => options,
    getScriptFileNames: () => [fileName],
    getScriptVersion: (name) => name === fileName ? String(version) : "0",
    getScriptSnapshot: (name) => {
      if (name === fileName) return runtime.ScriptSnapshot.fromString(document.generatedSource);
      const contents = runtime.sys.readFile(name);
      return contents === undefined ? undefined : runtime.ScriptSnapshot.fromString(contents);
    },
    getCurrentDirectory: () => process.cwd(),
    getDefaultLibFileName: (compilerOptions) => runtime.getDefaultLibFilePath(compilerOptions),
    fileExists: runtime.sys.fileExists,
    readFile: runtime.sys.readFile,
    readDirectory: runtime.sys.readDirectory,
    directoryExists: runtime.sys.directoryExists,
    getDirectories: runtime.sys.getDirectories
  };
  sharedDocumentRegistry ??= runtime.createDocumentRegistry();
  return { document, fileName, service: runtime.createLanguageService(host, sharedDocumentRegistry) };
}

async function loadTypeScript(): Promise<TypeScriptRuntime> {
  return typescriptPromise ??= import("typescript");
}

function hashSource(source: string): string {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) hash = Math.imul(hash ^ source.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(36);
}

function flattenDiagnosticMessage(message: string | ts.DiagnosticMessageChain): string {
  if (typeof message === "string") return message;
  return [message.messageText, ...(message.next ?? []).map(flattenDiagnosticMessage)].join("\n");
}
