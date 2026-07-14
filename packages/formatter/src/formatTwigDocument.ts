import { EmbeddedSyntaxError, formatEmbeddedBlocks } from "./embeddedFormatters";
import { expandHybridFormattingRange, parseHybridDocument, validateHybridDocument, type HybridQueryFailure } from "@twig-plus/parser";
import { printFormattedTwig, type FormatterOptions, type FormatterResult, type FormatterTiming, type RangeFormatterResult } from "./printer";
import { normalizeHybridSource } from "./sourceNormalizer";

export async function formatTwigDocument(source: string, options: FormatterOptions): Promise<string> {
  if (options.isCancellationRequested?.()) {
    options.onHybridFailure?.({ query: "format", reason: "cancelled", range: { start: 0, end: source.length } });
    return source;
  }

  let document: ReturnType<typeof parseHybridDocument>;
  const parseStarted = performance.now();
  try {
    document = parseHybridDocument(source);
  } catch (error) {
    options.onStage?.("parse", performance.now() - parseStarted);
    options.onHybridFailure?.({ query: "format", reason: "hybrid-parse-error", range: { start: 0, end: source.length }, message: error instanceof Error ? error.message : String(error) });
    return source;
  }
  options.onStage?.("parse", performance.now() - parseStarted);
  if (validateHybridDocument(document).length > 0) {
    options.onHybridFailure?.({ query: "format", reason: "hybrid-validation-error", range: { start: 0, end: source.length }, message: "Hybrid document validation failed." });
    return source;
  }

  let hybrid: string;
  try {
    hybrid = await formatParsedHybridDocument(document, options);
  } catch (error) {
    if (error instanceof EmbeddedSyntaxError) {
      const cause = error.cause instanceof Error ? error.cause.message : error.message;
      options.onEmbeddedSyntaxError?.({ language: error.language, message: cause, range: error.range });
      return source;
    }
    options.onHybridFailure?.({ query: "format", reason: "hybrid-error", range: { start: 0, end: source.length }, message: error instanceof Error ? error.message : String(error) });
    return source;
  }
  return hybrid;
}

export async function formatTwigDocumentWithResult(source: string, options: FormatterOptions): Promise<FormatterResult> {
  const timings: FormatterTiming[] = [];
  let embeddedFailure: { language: string; message: string; range?: { start: number; end: number } } | undefined;
  let hybridFailure: HybridQueryFailure | undefined;
  const startedAt = performance.now();
  try {
    if (options.isCancellationRequested?.()) return { ok: false, error: { code: "cancelled", message: "Formatting was cancelled." }, timings };
    const text = await formatTwigDocument(source, {
      ...options,
      onStage: (stage, durationMs) => {
        timings.push({ stage, startedAt: performance.now() - startedAt - durationMs, durationMs });
        options.onStage?.(stage, durationMs);
      },
      onEmbeddedSyntaxError: (error) => { embeddedFailure = error; options.onEmbeddedSyntaxError?.(error); },
      onHybridFailure: (failure) => { hybridFailure = failure; options.onHybridFailure?.(failure); }
    });
    if (options.isCancellationRequested?.()) return { ok: false, error: { code: "cancelled", message: "Formatting was cancelled." }, timings };
    if (embeddedFailure) return { ok: false, error: { code: "embedded-syntax", ...embeddedFailure }, timings };
    if (hybridFailure) return { ok: false, error: { code: hybridFailure.reason === "cancelled" ? "cancelled" : "format-failed", message: hybridFailure.message ?? hybridFailure.reason, range: hybridFailure.range }, timings };
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

export async function formatTwigRangeWithResult(
  source: string, requested: { start: number; end: number }, options: FormatterOptions
): Promise<RangeFormatterResult> {
  if (options.isCancellationRequested?.()) return { ok: false, error: { code: "cancelled", message: "Formatting was cancelled." }, timings: [] };
  const range = expandHybridFormattingRange(source, requested);
  if (!range) return { ok: false, error: { code: "unsafe-range", message: "The selection does not contain a complete safe Twig/HTML structure." }, timings: [] };
  const fragment = source.slice(range.start, range.end);
  const firstContent = fragment.split(/\r?\n/).find((line) => line.trim());
  const baseIndent = firstContent?.match(/^[\t ]*/)?.[0] ?? "";
  const dedented = fragment.split(/\r?\n/).map((line) => line.startsWith(baseIndent) ? line.slice(baseIndent.length) : line).join("\n");
  const result = await formatTwigDocumentWithResult(dedented, options);
  if (!result.ok) return { ok: false, error: { code: result.error.code === "cancelled" ? "cancelled" : "format-failed", message: result.error.message }, timings: result.timings };
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const text = result.text.split("\n").map((line) => line ? baseIndent + line : line).join(eol);
  return { ok: true, text, range, timings: result.timings };
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
