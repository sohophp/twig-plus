import {
  collectTwigBlockSymbols,
  collectTwigMacroImports,
  collectTwigStructureSymbols,
  getBlockReferenceAtOffset,
  getExtendsTemplateReference,
  getTwigMacroReferenceAtOffset,
  type TwigBlockSymbolData,
  type TwigMacroImport,
  type TwigMacroReference
} from "./blockAnalysis";
import {
  collectHybridBlockSymbols,
  collectHybridMacroImports,
  collectHybridStructureSymbols,
  getHybridBlockReferenceAtOffset,
  getHybridExtendsTemplateReference,
  getHybridMacroReferenceAtOffset,
  getHybridCompletionContext,
  getHybridTokenContextAtOffset,
  collectHybridSelectionRanges,
  parseHybridDocument,
  validateHybridDocument,
  type HybridDocument,
  type NodePair
} from "./hybridAst";
import { collectSelectionRanges, type SourceRange } from "./selectionRanges";
import { getTwigCompletionContext } from "./twigStructure";
import { analyzeHybridDiagnostics, analyzeTwigDiagnostics, type TwigDiagnostic } from "./twigDiagnostics";
import { getTwigTokenContextAtOffset, type TwigTokenContext } from "./twigTokenContext";

export type ParserEngine = "legacy" | "hybrid-shadow" | "hybrid";
export type HybridQueryName = "context" | "symbols" | "navigation" | "control-pairs" | "completion" | "selection-ranges" | "diagnostics" | "format";

export interface HybridDifference {
  query: HybridQueryName;
  reason: "result-mismatch" | "invalid-document" | "hybrid-error" | "hybrid-parse-error" | "hybrid-validation-error" | "cancelled";
  range: SourceRange;
  legacySummary?: string;
  hybridSummary?: string;
  fallbackUsed?: boolean;
}

export interface HybridQueryOptions {
  engine?: ParserEngine;
  onDifference?: (difference: HybridDifference) => void;
  hybridDocument?: HybridDocument;
}

export function getCompatibleContextAtOffset(source: string, offset: number, options: HybridQueryOptions = {}): TwigTokenContext {
  return resolveQuery("context", source, options, () => getTwigTokenContextAtOffset(source, offset), (document) =>
    getHybridTokenContextAtOffset(document, offset));
}

export function collectCompatibleStructureSymbols(source: string, options: HybridQueryOptions = {}): TwigBlockSymbolData[] {
  return resolveQuery("symbols", source, options, () => collectTwigStructureSymbols(source), (document) =>
    collectHybridStructureSymbols(document));
}

export function collectCompatibleBlockSymbols(source: string, options: HybridQueryOptions = {}): TwigBlockSymbolData[] {
  return resolveQuery("navigation", source, options, () => collectTwigBlockSymbols(source), collectHybridBlockSymbols);
}

export function getCompatibleBlockReferenceAtOffset(source: string, offset: number, options: HybridQueryOptions = {}): TwigBlockSymbolData | null {
  return resolveQuery("navigation", source, options, () => getBlockReferenceAtOffset(source, offset), (document) =>
    getHybridBlockReferenceAtOffset(document, offset));
}

export function collectCompatibleMacroImports(source: string, options: HybridQueryOptions = {}): TwigMacroImport[] {
  return resolveQuery("navigation", source, options, () => collectTwigMacroImports(source), (document) =>
    collectHybridMacroImports(document));
}

export function getCompatibleMacroReferenceAtOffset(source: string, offset: number, options: HybridQueryOptions = {}): TwigMacroReference | null {
  return resolveQuery("navigation", source, options, () => getTwigMacroReferenceAtOffset(source, offset), (document) =>
    getHybridMacroReferenceAtOffset(document, offset));
}

export function getCompatibleExtendsTemplateReference(source: string, options: HybridQueryOptions = {}): string | null {
  return resolveQuery("navigation", source, options, () => getExtendsTemplateReference(source), (document) =>
    getHybridExtendsTemplateReference(document));
}

export function collectCompatibleControlPairs(source: string, options: HybridQueryOptions = {}): NodePair[] {
  return resolveQuery("control-pairs", source, options, () => parseHybridDocument(source).twigControlBlocks, (document) => document.twigControlBlocks);
}

export function getCompatibleCompletionContext(source: string, offset: number, options: HybridQueryOptions = {}): ReturnType<typeof getTwigCompletionContext> {
  return resolveQuery("completion", source, options, () => getTwigCompletionContext(source, offset), (document) =>
    getHybridCompletionContext(document, offset));
}

export function collectCompatibleSelectionRanges(source: string, offset: number, options: HybridQueryOptions = {}): SourceRange[] {
  return resolveQuery("selection-ranges", source, options, () => collectSelectionRanges(source, offset), (document) =>
    collectHybridSelectionRanges(document, offset).map(({ start, end }) => ({ start, end })));
}

export function analyzeCompatibleDiagnostics(
  source: string,
  workspacePaths: string[] = [],
  currentWorkspacePath?: string,
  templateRoots?: string[],
  options: HybridQueryOptions = {}
): TwigDiagnostic[] {
  const run = (value: string) => analyzeTwigDiagnostics(value, workspacePaths, currentWorkspacePath, templateRoots);
  return resolveQuery("diagnostics", source, options, () => run(source), (document) =>
    analyzeHybridDiagnostics(document, workspacePaths, currentWorkspacePath, templateRoots));
}

function resolveQuery<T>(
  query: HybridQueryName,
  source: string,
  options: HybridQueryOptions,
  legacy: () => T,
  hybrid: (document: HybridDocument) => T
): T {
  const engine = options.engine ?? "hybrid";
  if (engine === "legacy") return legacy();
  try {
    const document = options.hybridDocument?.source === source
      ? options.hybridDocument
      : parseHybridDocument(source);
    if (validateHybridDocument(document).length > 0) {
      report(options, query, "invalid-document", source.length);
    }
    const hybridResult = hybrid(document);
    if (engine === "hybrid-shadow") {
      const legacyResult = legacy();
      if (!equalResults(legacyResult, hybridResult)) reportMismatch(options, query, legacyResult, hybridResult, source.length);
      return legacyResult;
    }
    return hybridResult;
  } catch {
    report(options, query, "hybrid-error", source.length, true);
    return legacy();
  }
}

function equalResults(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function report(options: HybridQueryOptions, query: HybridQueryName, reason: HybridDifference["reason"], sourceLength: number, fallbackUsed = false): void {
  options.onDifference?.({ query, reason, range: { start: 0, end: sourceLength }, fallbackUsed });
}

function reportMismatch(options: HybridQueryOptions, query: HybridQueryName, legacy: unknown, hybrid: unknown, sourceLength: number): void {
  const left = Array.isArray(legacy) ? legacy : [legacy];
  const right = Array.isArray(hybrid) ? hybrid : [hybrid];
  let index = 0;
  while (index < left.length && index < right.length && equalResults(left[index], right[index])) index += 1;
  const legacyItem = left[index];
  const hybridItem = right[index];
  const rangeItem = (legacyItem ?? hybridItem) as Partial<SourceRange> | undefined;
  options.onDifference?.({
    query,
    reason: "result-mismatch",
    range: { start: rangeItem?.start ?? 0, end: rangeItem?.end ?? sourceLength },
    legacySummary: summarize(legacyItem),
    hybridSummary: summarize(hybridItem)
  });
}

function summarize(value: unknown): string {
  if (!value || typeof value !== "object") return String(value);
  const item = value as Record<string, unknown>;
  return [item.kind, item.name, item.start, item.end].filter((part) => part !== undefined).join(":");
}
