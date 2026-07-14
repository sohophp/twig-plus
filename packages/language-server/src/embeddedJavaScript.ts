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
export interface EmbeddedHover { range: SourceRange; contents: string; }
export interface EmbeddedSignatureHelp { label: string; parameters: string[]; activeParameter: number; documentation?: string; }
export interface EmbeddedDefinition { range: SourceRange; }

interface CachedDocument {
  version: number;
  scripts: ScriptService[];
}

interface ScriptService {
  document: EmbeddedScriptDocument;
  fileName: string;
  runtime: TypeScriptRuntime;
  service: ts.LanguageService;
}

interface RenameTarget {
  script: ScriptService;
  triggerRange: SourceRange;
  locations: readonly ts.RenameLocation[];
  ranges: SourceRange[];
}

type TypeScriptRuntime = typeof import("typescript");
let typescriptPromise: Promise<TypeScriptRuntime> | null = null;
let sharedDocumentRegistry: ts.DocumentRegistry | null = null;

export function isTypeScriptRuntimeLoaded(): boolean { return typescriptPromise !== null; }

export class EmbeddedJavaScriptService {
  private readonly cache = new Map<string, CachedDocument>();

  async getCompletions(
    uri: string,
    version: number,
    document: HybridDocument,
    originalOffset: number,
    options: { triggerCharacter?: string } = {}
  ): Promise<EmbeddedCompletion[] | null> {
    const cached = await this.getDocument(uri, version, document);
    const script = cached.scripts.find((item) =>
      originalOffset >= item.document.sourceRange.start && originalOffset <= item.document.sourceRange.end);
    if (!script) return null;
    const generatedOffset = script.document.toGeneratedOffset(originalOffset);
    if (generatedOffset === null) return [];
    // `(` belongs to signature help and `{` commonly starts an arrow/function
    // body. Automatic global completion at either position makes Enter accept
    // an unrelated symbol. Explicit completion remains available.
    if (options.triggerCharacter === "(" || options.triggerCharacter === "{") return [];
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

  async getHover(uri: string, version: number, document: HybridDocument, originalOffset: number): Promise<EmbeddedHover | null> {
    const script = (await this.getDocument(uri, version, document)).scripts.find((item) =>
      originalOffset >= item.document.sourceRange.start && originalOffset <= item.document.sourceRange.end);
    if (!script) return null;
    const generatedOffset = script.document.toGeneratedOffset(originalOffset); if (generatedOffset === null) return null;
    const info = script.service.getQuickInfoAtPosition(script.fileName, generatedOffset); if (!info) return null;
    const range = script.document.toOriginalRange(info.textSpan.start, info.textSpan.start + info.textSpan.length); if (!range) return null;
    const display = displayParts(info.displayParts);
    const documentation = displayParts(info.documentation);
    return { range, contents: [`\`\`\`javascript`, display, "\`\`\`", documentation].filter(Boolean).join("\n") };
  }

  async getSignatureHelp(uri: string, version: number, document: HybridDocument, originalOffset: number): Promise<EmbeddedSignatureHelp | null> {
    const script = (await this.getDocument(uri, version, document)).scripts.find((item) =>
      originalOffset >= item.document.sourceRange.start && originalOffset <= item.document.sourceRange.end);
    if (!script) return null;
    const generatedOffset = script.document.toGeneratedOffset(originalOffset); if (generatedOffset === null) return null;
    const help = script.service.getSignatureHelpItems(script.fileName, generatedOffset, undefined); if (!help?.items.length) return null;
    const item = help.items[Math.min(help.selectedItemIndex, help.items.length - 1)];
    const parameters = item.parameters.map((parameter) => displayParts(parameter.displayParts));
    const label = displayParts(item.prefixDisplayParts) + parameters.join(displayParts(item.separatorDisplayParts)) + displayParts(item.suffixDisplayParts);
    return { label, parameters, activeParameter: Math.min(help.argumentIndex, Math.max(0, parameters.length - 1)), documentation: displayParts(item.documentation) || undefined };
  }

  async getDefinition(uri: string, version: number, document: HybridDocument, originalOffset: number): Promise<EmbeddedDefinition | null> {
    const script = (await this.getDocument(uri, version, document)).scripts.find((item) =>
      originalOffset >= item.document.sourceRange.start && originalOffset <= item.document.sourceRange.end);
    if (!script) return null;
    const generatedOffset = script.document.toGeneratedOffset(originalOffset);
    if (generatedOffset === null) return null;
    const definitions = script.service.getDefinitionAtPosition(script.fileName, generatedOffset) ?? [];
    for (const definition of definitions) {
      if (definition.fileName !== script.fileName) continue;
      const range = script.document.toOriginalRange(
        definition.textSpan.start,
        definition.textSpan.start + definition.textSpan.length
      );
      if (range) return { range };
    }
    return null;
  }

  async prepareRename(uri: string, version: number, document: HybridDocument, originalOffset: number): Promise<SourceRange | null> {
    return (await this.getRenameTarget(uri, version, document, originalOffset))?.triggerRange ?? null;
  }

  async getRenameEdits(
    uri: string,
    version: number,
    document: HybridDocument,
    originalOffset: number,
    newName: string
  ): Promise<SourceRange[] | null> {
    const target = await this.getRenameTarget(uri, version, document, originalOffset);
    if (!target || !isJavaScriptIdentifier(target.script.runtime, newName)) return null;
    if (hasRenameCollision(target, newName)) return null;
    return target.ranges;
  }

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

  private async getRenameTarget(
    uri: string,
    version: number,
    document: HybridDocument,
    originalOffset: number
  ): Promise<RenameTarget | null> {
    const script = (await this.getDocument(uri, version, document)).scripts.find((item) =>
      originalOffset >= item.document.sourceRange.start && originalOffset <= item.document.sourceRange.end);
    if (!script) return null;
    const generatedOffset = script.document.toGeneratedOffset(originalOffset);
    if (generatedOffset === null) return null;
    const definitions = script.service.getDefinitionAtPosition(script.fileName, generatedOffset) ?? [];
    if (!definitions.some((definition) => definition.fileName === script.fileName &&
      script.document.toOriginalRange(definition.textSpan.start, definition.textSpan.start + definition.textSpan.length))) return null;
    const info = script.service.getRenameInfo(script.fileName, generatedOffset, { allowRenameOfImportPath: false });
    if (!info.canRename || info.fileToRename) return null;
    const triggerRange = script.document.toOriginalRange(info.triggerSpan.start, info.triggerSpan.start + info.triggerSpan.length);
    if (!triggerRange) return null;
    const locations = script.service.findRenameLocations(script.fileName, generatedOffset, false, false, false) ?? [];
    if (locations.length === 0 || locations.some((location) =>
      location.fileName !== script.fileName || location.prefixText !== undefined || location.suffixText !== undefined)) return null;
    const ranges: SourceRange[] = [];
    for (const location of locations) {
      const range = script.document.toOriginalRange(location.textSpan.start, location.textSpan.start + location.textSpan.length);
      if (!range) return null;
      if (!ranges.some((item) => item.start === range.start && item.end === range.end)) ranges.push(range);
    }
    return { script, triggerRange, locations, ranges };
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
  return { document, fileName, runtime, service: runtime.createLanguageService(host, sharedDocumentRegistry) };
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

function displayParts(parts: readonly ts.SymbolDisplayPart[] | undefined): string { return parts?.map((part) => part.text).join("") ?? ""; }

function isJavaScriptIdentifier(runtime: TypeScriptRuntime, value: string): boolean {
  if (!value) return false;
  const scanner = runtime.createScanner(runtime.ScriptTarget.ES2022, false, runtime.LanguageVariant.Standard, value);
  return scanner.scan() === runtime.SyntaxKind.Identifier && scanner.getTokenText() === value &&
    scanner.scan() === runtime.SyntaxKind.EndOfFileToken;
}

// Binder/checker diagnostics for duplicate declarations and conflicting imports/exports.
const RENAME_COLLISION_CODES = new Set([2300, 2395, 2440, 2451, 2484, 6200]);

function hasRenameCollision(target: RenameTarget, newName: string): boolean {
  const beforeCounts = collisionCounts(target.script.service.getSemanticDiagnostics(target.script.fileName));
  const generatedSource = applyRenameLocations(target.script.document.generatedSource, target.locations, newName);
  const validationDocument = { ...target.script.document, generatedSource };
  const validation = createScriptService(target.script.runtime, "rename-validation", 0, validationDocument, 0);
  try {
    const afterCounts = collisionCounts(validation.service.getSemanticDiagnostics(validation.fileName));
    return [...afterCounts].some(([code, count]) => count > (beforeCounts.get(code) ?? 0));
  } finally {
    validation.service.dispose();
  }
}

function collisionCounts(diagnostics: readonly ts.Diagnostic[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const diagnostic of diagnostics) {
    if (RENAME_COLLISION_CODES.has(diagnostic.code)) counts.set(diagnostic.code, (counts.get(diagnostic.code) ?? 0) + 1);
  }
  return counts;
}

function applyRenameLocations(source: string, locations: readonly ts.RenameLocation[], newName: string): string {
  return [...locations]
    .sort((left, right) => right.textSpan.start - left.textSpan.start)
    .reduce((result, location) => result.slice(0, location.textSpan.start) + newName +
      result.slice(location.textSpan.start + location.textSpan.length), source);
}
