import { formatEmbeddedBlocks } from "./embeddedFormatters";
import { printFormattedTwig, type FormatOptions } from "./printer";
import { tokenizeTwig } from "./twigTokenizer";

export async function formatTwigDocument(
  source: string,
  options: FormatOptions
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
