import { EmbeddedSyntaxError, formatEmbeddedBlocks } from "./embeddedFormatters";
import { parseHybridDocument, tokenizeTwig, validateHybridDocument } from "@twig-plus/parser";
import { printFormattedTwig, type FormatterOptions, type FormatterResult, type FormatterTiming } from "./printer";
import { normalizeHybridSource, normalizeTwigSourceFragments } from "./sourceNormalizer";

export async function formatTwigDocument(source: string, options: FormatterOptions): Promise<string> {
  const engine = options.parserEngine ?? "legacy";
  if (engine === "legacy") return formatLegacyDocument(source, options);
  if (options.isCancellationRequested?.()) {
    options.onHybridDifference?.({ query: "format", reason: "cancelled", range: { start: 0, end: source.length } });
    return source;
  }

  let document: ReturnType<typeof parseHybridDocument>;
  const parseStarted = performance.now();
  try {
    document = parseHybridDocument(source);
  } catch {
    options.onStage?.("parse", performance.now() - parseStarted);
    options.onHybridDifference?.({ query: "format", reason: "hybrid-parse-error", range: { start: 0, end: source.length } });
    return formatLegacyDocument(source, options);
  }
  options.onStage?.("parse", performance.now() - parseStarted);
  if (validateHybridDocument(document).length > 0) {
    options.onHybridDifference?.({ query: "format", reason: "hybrid-validation-error", range: { start: 0, end: source.length } });
    return formatLegacyDocument(source, options);
  }

  const hybrid = await formatParsedHybridDocument(document, options);
  if (engine === "hybrid") return hybrid;

  const legacy = await formatLegacyDocument(source, { ...options, onStage: undefined });
  if (hybrid !== legacy) options.onHybridDifference?.({ query: "format", reason: "result-mismatch", range: { start: 0, end: source.length } });
  return legacy;
}

export async function formatTwigDocumentWithResult(source: string, options: FormatterOptions): Promise<FormatterResult> {
  const timings: FormatterTiming[] = [];
  let embeddedFailure: { language: string; message: string; range?: { start: number; end: number } } | undefined;
  const startedAt = performance.now();
  try {
    if (options.isCancellationRequested?.()) return { ok: false, error: { code: "cancelled", message: "Formatting was cancelled." }, timings };
    const text = await formatTwigDocument(source, {
      ...options,
      onStage: (stage, durationMs) => {
        timings.push({ stage, startedAt: performance.now() - startedAt - durationMs, durationMs });
        options.onStage?.(stage, durationMs);
      },
      onEmbeddedSyntaxError: (error) => { embeddedFailure = error; options.onEmbeddedSyntaxError?.(error); }
    });
    if (options.isCancellationRequested?.()) return { ok: false, error: { code: "cancelled", message: "Formatting was cancelled." }, timings };
    if (embeddedFailure) return { ok: false, error: { code: "embedded-syntax", ...embeddedFailure }, timings };
    const durationMs = performance.now() - startedAt;
    timings.push({ stage: "complete", startedAt: 0, durationMs });
    options.onStage?.("complete", durationMs);
    return { ok: true, text, timings };
  } catch (error) {
    return { ok: false, error: {
      code: options.isCancellationRequested?.() ? "cancelled" : "format-failed",
      message: error instanceof Error ? error.message : String(error)
    }, timings };
  }
}

async function formatParsedHybridDocument(document: ReturnType<typeof parseHybridDocument>, options: FormatterOptions): Promise<string> {
  const normalizeStarted = performance.now();
  const normalized = normalizeHybridSource(document);
  options.onStage?.("twig", performance.now() - normalizeStarted);
  const embedded = await formatEmbeddedBlocks(normalized, options);
  const printStarted = performance.now();
  const result = printFormattedTwig(embedded, options);
  options.onStage?.("html", performance.now() - printStarted);
  return result;
}

async function formatLegacyDocument(source: string, options: FormatterOptions): Promise<string> {
  try {
    const parseStarted = performance.now();
    tokenizeTwig(source);
    options.onStage?.("parse", performance.now() - parseStarted);
    const normalizeStarted = performance.now();
    const normalized = normalizeTwigSourceFragments(source);
    options.onStage?.("twig", performance.now() - normalizeStarted);
    const embedded = await formatEmbeddedBlocks(normalized, options);
    const printStarted = performance.now();
    const result = printFormattedTwig(embedded, options);
    options.onStage?.("html", performance.now() - printStarted);
    return result;
  } catch (error) {
    if (error instanceof EmbeddedSyntaxError) {
      const cause = error.cause instanceof Error ? error.cause.message : error.message;
      options.onEmbeddedSyntaxError?.({ language: error.language, message: cause, range: error.range });
    } else console.error("[TwigPlus] format skipped; returning original source:", error);
    return source;
  }
}
