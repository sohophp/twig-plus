import { formatEmbeddedBlocks } from "./embeddedFormatters";
import { tokenizeTwig } from "@twig-plus/parser";

import { printFormattedTwig, type FormatterOptions } from "./printer";
import { normalizeTwigSourceFragments } from "./sourceNormalizer";

export async function formatTwigDocument(
  source: string,
  options: FormatterOptions
): Promise<string> {
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
