import { formatEmbeddedBlocks } from "./embeddedFormatters";
import { tokenizeTwig } from "@twig-plus/parser";

import { printFormattedTwig, type FormatterOptions } from "./printer";

export async function formatTwigDocument(
  source: string,
  options: FormatterOptions
): Promise<string> {
  try {
    tokenizeTwig(source);
    const sourceWithEmbeddedBlocks = await formatEmbeddedBlocks(source, options);
    return printFormattedTwig(sourceWithEmbeddedBlocks, options);
  } catch (error) {
    console.error("[TwigPlus] format failed:", error);
    return source;
  }
}
