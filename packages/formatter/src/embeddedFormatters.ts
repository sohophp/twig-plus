import { tokenizeTwig } from "@twig-plus/parser";

import type { FormatterOptions } from "./printer";

const EMBEDDED_BLOCK_PATTERN = /<(script|style)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
const SCRIPT_PARSER = "babel";
const STYLE_PARSER = "css";
let prettierPromise: Promise<typeof import("prettier")> | null = null;

export function isEmbeddedFormatterRuntimeLoaded(): boolean { return prettierPromise !== null; }

export class EmbeddedSyntaxError extends Error {
  constructor(readonly language: string, options: { cause: unknown; range?: { start: number; end: number } }) {
    super(`Invalid embedded ${language} syntax`, options);
    this.name = "EmbeddedSyntaxError";
    this.range = options.range;
  }
  readonly range?: { start: number; end: number };
}

export async function formatEmbeddedBlocks(
  source: string,
  options: FormatterOptions
): Promise<string> {
  let result = "";
  let lastIndex = 0;

  for (const match of source.matchAll(EMBEDDED_BLOCK_PATTERN)) {
    if (options.isCancellationRequested?.()) throw new Error("TwigPlus formatting cancelled");
    const [fullMatch, tagName, attributes, innerContent] = match;
    const start = match.index ?? 0;
    const end = start + fullMatch.length;

    result += source.slice(lastIndex, start);

    const started = performance.now();
    let formattedInner: string;
    try {
      formattedInner = await formatEmbeddedBlockContent(tagName.toLowerCase(), innerContent, options);
    } catch (error) {
      if (error instanceof EmbeddedSyntaxError) {
        const contentStart = start + `<${tagName}${attributes}>`.length;
        throw new EmbeddedSyntaxError(error.language, {
          cause: error.cause ?? error,
          range: { start: contentStart, end: contentStart + innerContent.length }
        });
      }
      throw error;
    }
    options.onStage?.(tagName.toLowerCase() === "script" ? "javascript" : "css", performance.now() - started);

    result += `<${tagName}${attributes}>${formattedInner}</${tagName}>`;
    lastIndex = end;
  }

  result += source.slice(lastIndex);
  return result;
}

async function formatEmbeddedBlockContent(
  tagName: string,
  innerContent: string,
  options: FormatterOptions
): Promise<string> {
  if (!innerContent.trim()) {
    return innerContent;
  }

  const parser = tagName === "script" ? SCRIPT_PARSER : STYLE_PARSER;
  const normalized = innerContent.replace(/\r\n/g, "\n");
  const trimmed = trimBlankLines(normalized);
  const dedented = dedentBlock(trimmed);
  const mappingStarted = performance.now();
  const { protectedSource, placeholders } = protectTwigSegments(dedented);
  options.onStage?.("mapping", performance.now() - mappingStarted);

  try {
    const { format } = await (prettierPromise ??= import("prettier"));
    const formatted = await format(protectedSource, {
      parser,
      printWidth: options.printWidth,
      tabWidth: options.indentSize,
      useTabs: options.useTabs
    });

    const restoreStarted = performance.now();
    const restored = restoreTwigSegments(formatted.trimEnd(), placeholders);
    options.onStage?.("mapping", performance.now() - restoreStarted);
    return `\n${restored}\n`;
  } catch (error) {
    throw new EmbeddedSyntaxError(tagName, { cause: error });
  }
}

function protectTwigSegments(source: string): {
  protectedSource: string;
  placeholders: Map<string, string>;
} {
  const placeholders = new Map<string, string>();
  let protectedSource = source;
  let offset = 0;

  for (const token of tokenizeTwig(source)) {
    const placeholder = `TWIGPLUS_PLACEHOLDER_${placeholders.size}`;
    placeholders.set(placeholder, token.raw);

    const start = token.start + offset;
    const end = token.end + offset;

    protectedSource =
      protectedSource.slice(0, start) +
      placeholder +
      protectedSource.slice(end);

    offset += placeholder.length - token.raw.length;
  }

  return { protectedSource, placeholders };
}

function restoreTwigSegments(
  source: string,
  placeholders: Map<string, string>
): string {
  let restored = source;

  for (const [placeholder, original] of placeholders) {
    restored = restored.replaceAll(placeholder, original);
  }

  return restored;
}

function trimBlankLines(source: string): string {
  return source.replace(/^\s*\n/, "").replace(/\n\s*$/, "");
}

function dedentBlock(source: string): string {
  const lines = source.split("\n");
  let minIndent = Number.POSITIVE_INFINITY;

  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }

    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    minIndent = Math.min(minIndent, indent);
  }

  if (!Number.isFinite(minIndent) || minIndent === 0) {
    return source;
  }

  return lines
    .map((line) => (line.trim() ? line.slice(minIndent) : ""))
    .join("\n");
}
