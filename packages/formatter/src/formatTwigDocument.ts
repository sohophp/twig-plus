import { formatEmbeddedBlocks } from "./embeddedFormatters";
import {
  parseHybridDocument,
  tokenizeTwig,
  validateHybridDocument
} from "@twig-plus/parser";

import { printFormattedTwig, type FormatterOptions } from "./printer";
import { normalizeHybridSource, normalizeTwigSourceFragments } from "./sourceNormalizer";

export async function formatTwigDocument(
  source: string,
  options: FormatterOptions
): Promise<string> {
  const engine = options.parserEngine ?? "legacy";
  if (engine === "legacy") {
    return formatLegacyDocument(source, options);
  }

  const legacy = await formatLegacyDocument(source, options);
  try {
    const document = parseHybridDocument(source);
    if (validateHybridDocument(document).length > 0) {
      options.onHybridDifference?.({ query: "format", reason: "invalid-document", range: { start: 0, end: source.length } });
      return legacy;
    }
    const normalizedSource = normalizeHybridSource(document);
    const sourceWithEmbeddedBlocks = await formatEmbeddedBlocks(normalizedSource, options);
    const candidate = printFormattedTwig(sourceWithEmbeddedBlocks, options);
    if (candidate !== legacy) {
      options.onHybridDifference?.({ query: "format", reason: "result-mismatch", range: { start: 0, end: source.length } });
      return legacy;
    }
    return engine === "hybrid" ? candidate : legacy;
  } catch {
    options.onHybridDifference?.({ query: "format", reason: "hybrid-error", range: { start: 0, end: source.length } });
    return legacy;
  }
}

async function formatLegacyDocument(source: string, options: FormatterOptions): Promise<string> {
  try {
    const normalizedSource = normalizeTwigSourceFragments(source);
    tokenizeTwig(normalizedSource);
    const sourceWithEmbeddedBlocks = await formatEmbeddedBlocks(normalizedSource, options);
    return printFormattedTwig(sourceWithEmbeddedBlocks, options);
  } catch (error) {
    console.error("[TwigPlus] format skipped; returning original source:", error);
    return source;
  }
}
