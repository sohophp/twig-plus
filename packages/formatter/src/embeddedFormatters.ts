import { parseHybridDocument, tokenizeTwig } from "@twig-plus/parser";

import type { FormatterOptions } from "./printer";

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
  const embedded = parseHybridDocument(source).htmlElements
    .filter((pair) => pair.name === "script" || pair.name === "style")
    .sort((left, right) => left.start - right.start);
  for (const pair of embedded) {
    if (options.isCancellationRequested?.()) throw new Error("TwigPlus formatting cancelled");
    const tagName = pair.name;
    const start = pair.openStart;
    const end = pair.closeEnd;
    const innerContent = source.slice(pair.openEnd, pair.closeStart);

    result += source.slice(lastIndex, start);

    const started = performance.now();
    let formattedInner: string;
    try {
      formattedInner = await formatEmbeddedBlockContent(tagName.toLowerCase(), innerContent, options);
    } catch (error) {
      if (error instanceof EmbeddedSyntaxError) {
        const contentStart = pair.openEnd;
        throw new EmbeddedSyntaxError(error.language, {
          cause: error.cause ?? error,
          range: { start: contentStart, end: contentStart + innerContent.length }
        });
      }
      throw error;
    }
    options.onStage?.(tagName.toLowerCase() === "script" ? "javascript" : "css", performance.now() - started);

    result += source.slice(pair.openStart, pair.openEnd) + formattedInner + source.slice(pair.closeStart, pair.closeEnd);
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
  let prefix = `__TWIGPLUS_${hashSource(source)}_`;
  while (source.includes(prefix)) prefix = `_${prefix}`;

  for (const token of tokenizeTwig(source)) {
    const placeholder = `${prefix}${placeholders.size}__`;
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
  if (placeholders.size === 0) return source;
  const pattern = new RegExp([...placeholders.keys()].map(escapeRegExp).join("|"), "g");
  return source.replace(pattern, (placeholder) => placeholders.get(placeholder) ?? placeholder);
}

function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function hashSource(source: string): string {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) hash = Math.imul(hash ^ source.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(36);
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
