import {
  getLeadingDedentCount,
  getLineIndentDeltaAfterLeading,
  getStandaloneTwigTagContent,
  getTwigTagKind
} from "@twig-plus/parser";
import type { HybridQueryFailure } from "@twig-plus/parser";
import { maskCompleteTwigSegments } from "./twigSyntaxMask";

export interface FormatterOptions {
  profile: "phpstorm" | "compact";
  indentSize: number;
  printWidth: number;
  useTabs: boolean;
  twigTagSpacing: boolean;
  htmlAttributeWrap: "preserve" | "auto" | "force";
  preserveSingleLineBlocks: boolean;
  lineBreakAfterTwigControlTag: boolean;
  onHybridFailure?: (failure: HybridQueryFailure) => void;
  onEmbeddedSyntaxError?: (error: { language: string; message: string; range?: { start: number; end: number } }) => void;
  onStage?: (stage: FormatterStage, elapsedMs: number) => void;
  isCancellationRequested?: () => boolean;
}

export type FormatterStage = "parse" | "twig" | "html" | "javascript" | "css" | "mapping" | "complete";

export interface FormatterTiming { stage: FormatterStage; startedAt: number; durationMs: number; }
export interface FormatterSuccess { ok: true; text: string; timings: FormatterTiming[]; }
export interface FormatterFailure {
  ok: false;
  error: { code: "cancelled" | "embedded-syntax" | "format-failed"; language?: string; message: string; range?: { start: number; end: number } };
  timings: FormatterTiming[];
}
export type FormatterResult = FormatterSuccess | FormatterFailure;
export interface RangeFormatterSuccess extends FormatterSuccess { range: { start: number; end: number }; }
export interface RangeFormatterFailure {
  ok: false;
  error: { code: "cancelled" | "unsafe-range" | "format-failed"; message: string };
  timings: FormatterTiming[];
}
export type RangeFormatterResult = RangeFormatterSuccess | RangeFormatterFailure;

export function printFormattedTwig(source: string, options: FormatterOptions): string {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const output: string[] = [];
  let indentLevel = 0;
  let embeddedBlockTag: "script" | "style" | null = null;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (!trimmed) {
      output.push("");
      continue;
    }

    const leadingDedent = getLeadingDedentCount(trimmed);
    indentLevel = Math.max(0, indentLevel - leadingDedent);

    const normalized = normalizeLine(trimmed, options);
    const renderedLines = renderLine(
      rawLine,
      normalized,
      indentLevel,
      options,
      embeddedBlockTag
    );

    for (const line of renderedLines) {
      output.push(line);
    }

    const lineDelta = getLineIndentDeltaAfterLeading(trimmed);
    indentLevel = Math.max(0, indentLevel + lineDelta);
    embeddedBlockTag = getNextEmbeddedBlockState(trimmed, embeddedBlockTag);
  }

  return output.join("\n");
}

function renderLine(
  rawLine: string,
  normalized: string,
  indentLevel: number,
  options: FormatterOptions,
  embeddedBlockTag: "script" | "style" | null
): string[] {
  if (embeddedBlockTag && !isEmbeddedClosingLine(normalized, embeddedBlockTag)) {
    const preservedIndent = rawLine.match(/^\s*/)?.[0] ?? "";
    return [getIndent(indentLevel, options) + preservedIndent + normalized];
  }

  const normalizedSingleChildWrapper = normalizeSingleChildHtmlWrapperLine(normalized);
  if (normalizedSingleChildWrapper) {
    return [`${getIndent(indentLevel, options)}${normalizedSingleChildWrapper}`];
  }

  const splitLines = maybeSplitTwigControlLine(normalized, indentLevel, options);
  if (splitLines) {
    return splitLines;
  }

  const splitInlineTwig = maybeSplitInlineTwigDirectiveLine(
    normalized,
    indentLevel,
    options
  );
  if (splitInlineTwig) {
    return splitInlineTwig;
  }

  const expanded = maybeExpandSingleLineBlock(normalized, indentLevel, options);
  if (expanded) {
    return expanded;
  }

  const splitHtml = maybeSplitLeadingHtmlTagLine(normalized, indentLevel, options);
  if (splitHtml) {
    return splitHtml;
  }

  const adjacentSiblings = maybeSplitAdjacentHtmlSiblingLine(
    normalized,
    indentLevel,
    options
  );
  if (adjacentSiblings) {
    return adjacentSiblings;
  }

  const trailingClose = maybeSplitTrailingHtmlClosingTagLine(
    normalized,
    indentLevel,
    options
  );
  if (trailingClose) {
    return trailingClose;
  }

  const wrapped = maybeWrapHtmlAttributes(normalized, indentLevel, options);
  if (wrapped) {
    return wrapped;
  }

  return [getIndent(indentLevel, options) + normalized];
}

function normalizeLine(line: string, options: FormatterOptions): string {
  if (!options.twigTagSpacing) {
    return line;
  }

  return line.replace(
    /\{\{[-~]?[\s\S]*?[-~]?\}\}|\{%-?[\s\S]*?-?%\}|\{#-?[\s\S]*?-?#\}/g,
    (match) => normalizeTwigSegment(match)
  );
}

function collapseWhitespace(value: string): string {
  return normalizeTwigExpressionSpacing(
    value.trim().replace(/\s+/g, " ").replace(/,\s*/g, ", ")
  );
}

function getIndent(level: number, options: FormatterOptions): string {
  if (options.useTabs) {
    return "\t".repeat(level);
  }

  return " ".repeat(level * options.indentSize);
}

function maybeExpandSingleLineBlock(
  line: string,
  indentLevel: number,
  options: FormatterOptions
): string[] | null {
  if (options.preserveSingleLineBlocks) {
    return null;
  }

  const match = line.match(/^<([A-Za-z][\w:-]*)([^>]*)>([^<>]+)<\/\1>$/);

  if (!match) {
    return null;
  }

  const [, tagName, rawAttributes, innerContent] = match;
  if (/^(script|style)$/i.test(tagName) || !innerContent.trim()) {
    return null;
  }

  const baseIndent = getIndent(indentLevel, options);
  const innerIndent = getIndent(indentLevel + 1, options);

  return [
    `${baseIndent}<${tagName}${rawAttributes}>`,
    `${innerIndent}${innerContent.trim()}`,
    `${baseIndent}</${tagName}>`
  ];
}

function maybeSplitTwigControlLine(
  line: string,
  indentLevel: number,
  options: FormatterOptions
): string[] | null {
  if (!options.lineBreakAfterTwigControlTag) {
    return null;
  }

  const match = line.match(/^(\{%-?[\s\S]*?-?%\})\s*(\S[\s\S]*)$/);
  if (!match) {
    return null;
  }

  const [, twigTag, trailing] = match;
  const content = getStandaloneTwigTagContent(twigTag);
  if (!content) {
    return null;
  }

  const tagKind = getTwigTagKind(content);
  if (tagKind !== "opening" && tagKind !== "middle" && tagKind !== "closing") {
    return null;
  }

  const trailingIndentLevel =
    tagKind === "opening" || tagKind === "middle"
      ? indentLevel + 1
      : indentLevel;

  return [
    `${getIndent(indentLevel, options)}${twigTag}`,
    ...renderStandaloneNormalizedLine(trailing, trailingIndentLevel, options)
  ];
}

function maybeWrapHtmlAttributes(
  line: string,
  indentLevel: number,
  options: FormatterOptions
): string[] | null {
  if (options.htmlAttributeWrap === "preserve") {
    return null;
  }

  const parsed = parseHtmlOpeningTag(line);
  if (!parsed || parsed.attributes.length < 2) {
    return null;
  }

  const shouldWrap =
    options.htmlAttributeWrap === "force" ||
    line.length > options.printWidth;

  if (!shouldWrap) {
    return null;
  }

  const baseIndent = getIndent(indentLevel, options);
  const attributeIndent = getIndent(indentLevel + 1, options);
  const lines = [`${baseIndent}<${parsed.tagName}`];

  for (const attribute of parsed.attributes) {
    lines.push(`${attributeIndent}${attribute}`);
  }

  lines[lines.length - 1] += parsed.selfClosing ? " />" : ">";

  return lines;
}

function maybeSplitInlineTwigDirectiveLine(
  line: string,
  indentLevel: number,
  options: FormatterOptions
): string[] | null {
  if (!options.lineBreakAfterTwigControlTag) {
    return null;
  }

  const match = line.match(/^(\{%-?[\s\S]*?-?%\})\s*(\S[\s\S]*)$/);
  if (!match) {
    return null;
  }

  const [, twigTag, trailing] = match;
  const tagContent = getStandaloneTwigTagContent(twigTag);
  if (!tagContent) {
    return null;
  }

  if (!shouldBreakAfterInlineTwigDirective(tagContent)) {
    return null;
  }

  return [
    `${getIndent(indentLevel, options)}${twigTag}`,
    ...renderStandaloneNormalizedLine(trailing, indentLevel, options)
  ];
}

function maybeSplitLeadingHtmlTagLine(
  line: string,
  indentLevel: number,
  options: FormatterOptions
): string[] | null {
  if (isSingleChildHtmlWrapperLine(line)) {
    return null;
  }

  const parsed = parseLeadingHtmlOpenTag(line);
  if (!parsed) {
    return null;
  }

  const { openingTag, trailing } = parsed;
  if (isSelfClosingTag(openingTag)) {
    return null;
  }

  if (!shouldSplitAfterOpeningTag(trailing)) {
    return null;
  }

  return [
    `${getIndent(indentLevel, options)}${openingTag}`,
    ...renderStandaloneNormalizedLine(trailing, indentLevel + 1, options)
  ];
}

function maybeSplitTrailingHtmlClosingTagLine(
  line: string,
  indentLevel: number,
  options: FormatterOptions
): string[] | null {
  if (isSingleChildHtmlWrapperLine(line)) {
    return null;
  }

  const match = line.match(/^(.*?)(<\/[A-Za-z][\w:-]*>)$/);
  if (!match) {
    return null;
  }

  const [, leading, closingTag] = match;
  const trimmedLeading = leading.trimEnd();
  if (!trimmedLeading || trimmedLeading.startsWith("</")) {
    return null;
  }

  const closingMatches = line.match(/<\/[A-Za-z][\w:-]*>/g) ?? [];
  const firstOpeningTag = line.match(/^<([A-Za-z][\w:-]*)/)?.[1]?.toLowerCase();
  const trailingClosingTag = closingTag.match(/^<\/([A-Za-z][\w:-]*)/)?.[1]?.toLowerCase();

  const shouldSplit =
    closingMatches.length > 1 ||
    (firstOpeningTag !== undefined &&
      trailingClosingTag !== undefined &&
      firstOpeningTag !== trailingClosingTag);

  if (!shouldSplit) {
    return null;
  }

  return [
    ...renderStandaloneNormalizedLine(trimmedLeading, indentLevel, options),
    `${getIndent(
      Math.max(0, indentLevel + getLineIndentDeltaAfterLeading(trimmedLeading) - 1),
      options
    )}${closingTag}`
  ];
}

function maybeSplitAdjacentHtmlSiblingLine(
  line: string,
  indentLevel: number,
  options: FormatterOptions
): string[] | null {
  const parsed = parseAdjacentHtmlSiblingLine(line);
  if (!parsed || parsed.nodes.length < 2) {
    return null;
  }

  const lines = parsed.nodes.flatMap((node) =>
    renderStandaloneNormalizedLine(node, indentLevel, options)
  );

  for (const closingTag of parsed.trailingClosingTags) {
    lines.push(`${getIndent(Math.max(0, indentLevel - 1), options)}${closingTag}`);
  }

  return lines;
}

function parseAdjacentHtmlSiblingLine(
  line: string
): { nodes: string[]; trailingClosingTags: string[] } | null {
  const nodes: string[] = [];
  let index = 0;

  while (index < line.length) {
    const remaining = line.slice(index).trimStart();
    index = line.length - remaining.length;

    if (!remaining.startsWith("<") || remaining.startsWith("</")) {
      break;
    }

    const nodeEnd = findTopLevelHtmlNodeEnd(line, index);
    if (nodeEnd === -1) {
      break;
    }

    nodes.push(line.slice(index, nodeEnd + 1));
    index = nodeEnd + 1;
  }

  const trailing = line.slice(index).trim();
  const trailingClosingTags =
    trailing.match(/^(<\/[A-Za-z][\w:-]*>)+$/)?.[0].match(/<\/[A-Za-z][\w:-]*>/g) ??
    [];

  if (trailing && trailingClosingTags.length === 0) {
    return null;
  }

  return {
    nodes,
    trailingClosingTags
  };
}

function findTopLevelHtmlNodeEnd(line: string, startIndex: number): number {
  const firstTagEnd = findHtmlTagEnd(line, startIndex);
  if (firstTagEnd === -1) {
    return -1;
  }

  const firstTag = line.slice(startIndex, firstTagEnd + 1);
  const firstTagName = firstTag.match(/^<([A-Za-z][\w:-]*)/)?.[1]?.toLowerCase();
  if (!firstTagName) {
    return -1;
  }

  if (isSelfClosingTag(firstTag)) {
    return firstTagEnd;
  }

  const stack = [firstTagName];
  let index = firstTagEnd + 1;

  while (index < line.length) {
    const nextTagStart = line.indexOf("<", index);
    if (nextTagStart === -1) {
      return -1;
    }

    const nextTagEnd = findHtmlTagEnd(line, nextTagStart);
    if (nextTagEnd === -1) {
      return -1;
    }

    const tag = line.slice(nextTagStart, nextTagEnd + 1);
    const tagName = tag.match(/^<\/?\s*([A-Za-z][\w:-]*)/)?.[1]?.toLowerCase();
    if (!tagName) {
      index = nextTagEnd + 1;
      continue;
    }

    if (tag.startsWith("</")) {
      if (stack.pop() !== tagName) {
        return -1;
      }

      if (stack.length === 0) {
        return nextTagEnd;
      }
    } else if (!isSelfClosingTag(tag)) {
      stack.push(tagName);
    }

    index = nextTagEnd + 1;
  }

  return -1;
}

function renderStandaloneNormalizedLine(
  line: string,
  indentLevel: number,
  options: FormatterOptions
): string[] {
  const normalizedSingleChildWrapper = normalizeSingleChildHtmlWrapperLine(line);
  if (normalizedSingleChildWrapper) {
    return [`${getIndent(indentLevel, options)}${normalizedSingleChildWrapper}`];
  }

  const nestedSplit = maybeSplitTwigControlLine(line, indentLevel, options);
  if (nestedSplit) {
    return nestedSplit;
  }

  const splitInlineTwig = maybeSplitInlineTwigDirectiveLine(
    line,
    indentLevel,
    options
  );
  if (splitInlineTwig) {
    return splitInlineTwig;
  }

  const expanded = maybeExpandSingleLineBlock(line, indentLevel, options);
  if (expanded) {
    return expanded;
  }

  const splitHtml = maybeSplitLeadingHtmlTagLine(line, indentLevel, options);
  if (splitHtml) {
    return splitHtml;
  }

  const adjacentSiblings = maybeSplitAdjacentHtmlSiblingLine(
    line,
    indentLevel,
    options
  );
  if (adjacentSiblings) {
    return adjacentSiblings;
  }

  const trailingClose = maybeSplitTrailingHtmlClosingTagLine(
    line,
    indentLevel,
    options
  );
  if (trailingClose) {
    return trailingClose;
  }

  const wrapped = maybeWrapHtmlAttributes(line, indentLevel, options);
  if (wrapped) {
    return wrapped;
  }

  return [`${getIndent(indentLevel, options)}${line}`];
}

function normalizeTwigSegment(segment: string): string {
  const match = segment.match(/^(\{\{[-~]?|\{%-?|\{#-?)([\s\S]*?)([-~]?\}\}|-?%\}|-?#\})$/);

  if (!match) {
    return segment;
  }

  const [, start, inner, end] = match;
  const collapsed = collapseWhitespace(inner);

  if (!collapsed) {
    return start + end;
  }

  return `${start} ${collapsed} ${end}`;
}

function shouldBreakAfterInlineTwigDirective(content: string): boolean {
  return /^(extends|include|import|from|set)\b/i.test(content.trim());
}

function shouldSplitAfterOpeningTag(trailing: string): boolean {
  if (/^<(?!\/)/.test(trailing)) {
    return true;
  }

  const twigTagMatch = trailing.match(/^(\{%-?[\s\S]*?-?%\})\s*(\S[\s\S]*)$/);
  if (!twigTagMatch) {
    return false;
  }

  const [, twigTag, remainder] = twigTagMatch;
  const content = getStandaloneTwigTagContent(twigTag);
  if (!content || !/^<(?!\/)/.test(remainder)) {
    return false;
  }

  const tagKind = getTwigTagKind(content);
  return (
    tagKind === "opening" ||
    tagKind === "middle" ||
    tagKind === "closing" ||
    shouldBreakAfterInlineTwigDirective(content)
  );
}

function getNextEmbeddedBlockState(
  line: string,
  current: "script" | "style" | null
): "script" | "style" | null {
  const html = maskCompleteTwigSegments(line);

  if (current && isEmbeddedClosingLine(html, current)) {
    return null;
  }

  if (current) {
    return current;
  }

  if (/<script\b[^>]*>/i.test(html) && !/<\/script>/i.test(html)) {
    return "script";
  }

  if (/<style\b[^>]*>/i.test(html) && !/<\/style>/i.test(html)) {
    return "style";
  }

  return null;
}

function isEmbeddedClosingLine(
  line: string,
  tagName: "script" | "style"
): boolean {
  return new RegExp(`</${tagName}>`, "i").test(maskCompleteTwigSegments(line));
}

function parseHtmlOpeningTag(line: string): {
  tagName: string;
  attributes: string[];
  selfClosing: boolean;
} | null {
  if (!line.startsWith("<") || line.startsWith("</")) {
    return null;
  }

  let quote: "\"" | "'" | null = null;
  let endIndex = -1;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (quote) {
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }

    if (char === ">") {
      endIndex = index;
      break;
    }
  }

  if (endIndex === -1 || endIndex !== line.length - 1) {
    return null;
  }

  const openingTag = line.slice(0, endIndex + 1);
  if (/<\/[A-Za-z][\w:-]*>\s*$/.test(openingTag)) {
    return null;
  }

  const match = openingTag.match(/^<([A-Za-z][\w:-]*)([\s\S]*?)(\/?)>$/);
  if (!match) {
    return null;
  }

  const [, tagName, rawAttributes, selfClosingMarker] = match;
  const attributes = splitAttributes(rawAttributes.trim());

  return {
    tagName,
    attributes,
    selfClosing: selfClosingMarker === "/"
  };
}

function parseLeadingHtmlOpenTag(line: string): {
  openingTag: string;
  tagName: string;
  trailing: string;
} | null {
  if (!line.startsWith("<") || line.startsWith("</")) {
    return null;
  }

  let quote: "\"" | "'" | null = null;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (quote) {
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }

    if (char !== ">") {
      continue;
    }

    const openingTag = line.slice(0, index + 1);
    const trailing = line.slice(index + 1).trimStart();
    const tagName = openingTag.match(/^<([A-Za-z][\w:-]*)/)?.[1];

    if (!tagName || !trailing) {
      return null;
    }

    return {
      openingTag,
      tagName,
      trailing
    };
  }

  return null;
}

function isSingleChildHtmlWrapperLine(line: string): boolean {
  const match = line.match(
    /^<([A-Za-z][\w:-]*)(?:"[^"]*"|'[^']*'|[^'"<>])*?>\s*([\s\S]*)\s*<\/\1>$/
  );
  if (!match) {
    return false;
  }

  const [, , innerContent] = match;
  if (innerContent.includes("{%") || !isBalancedHtmlFragment(innerContent)) {
    return false;
  }

  return countTopLevelHtmlChildElements(innerContent) === 1;
}

function normalizeSingleChildHtmlWrapperLine(line: string): string | null {
  if (!isSingleChildHtmlWrapperLine(line)) {
    return null;
  }

  return line.replace(/>\s+</g, "><").trim();
}

function isSelfClosingTag(tag: string): boolean {
  return (
    /\/>$/.test(tag) ||
    /^<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)\b/i.test(
      tag
    )
  );
}

function findHtmlTagEnd(line: string, startIndex: number): number {
  let quote: "\"" | "'" | null = null;

  for (let index = startIndex; index < line.length; index += 1) {
    const char = line[index];

    if (quote) {
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }

    if (char === ">") {
      return index;
    }
  }

  return -1;
}

function splitAttributes(source: string): string[] {
  if (!source) {
    return [];
  }

  const attributes: string[] = [];
  let current = "";
  let quote: "\"" | "'" | null = null;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (quote) {
      current += char;
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      current += char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        attributes.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) {
    attributes.push(current);
  }

  return attributes.filter(Boolean);
}

function normalizeTwigExpressionSpacing(value: string): string {
  return mapUnquotedTwigExpressionParts(value, (part) =>
    part
      .replace(/\s*\|\s*/g, "|")
      .replace(/\s*\.\s*/g, ".")
      .replace(/\b([A-Za-z_][A-Za-z0-9_]*)\s+\(/g, "$1(")
      .replace(/\(\s+/g, "(")
      .replace(/\s+\)/g, ")")
  );
}

function mapUnquotedTwigExpressionParts(
  value: string,
  normalize: (part: string) => string
): string {
  let result = "";
  let current = "";
  let quote: "\"" | "'" | null = null;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];

    if (quote) {
      current += char;
      if (char === "\\" && index + 1 < value.length) {
        index += 1;
        current += value[index];
        continue;
      }

      if (char === quote) {
        result += current;
        current = "";
        quote = null;
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      result += normalize(current);
      current = char;
      quote = char;
      continue;
    }

    current += char;
  }

  return result + (quote ? current : normalize(current));
}

function countTopLevelHtmlChildElements(source: string): number {
  let count = 0;
  let depth = 0;
  let quote: "\"" | "'" | null = null;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (quote) {
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }

    if (char !== "<" || source[index + 1] === "!" || source[index + 1] === "?") {
      continue;
    }

    if (source[index + 1] === "/") {
      depth = Math.max(0, depth - 1);
      continue;
    }

    if (!/[A-Za-z]/.test(source[index + 1] ?? "")) {
      continue;
    }

    if (depth === 0) {
      count += 1;
    }

    const closeIndex = source.indexOf(">", index + 1);
    const tag = closeIndex === -1 ? "" : source.slice(index, closeIndex + 1);
    if (!isSelfClosingTag(tag)) {
      depth += 1;
    }
  }

  return count;
}

function isBalancedHtmlFragment(source: string): boolean {
  const stack: string[] = [];
  let quote: "\"" | "'" | null = null;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (quote) {
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }

    if (char !== "<" || source[index + 1] === "!" || source[index + 1] === "?") {
      continue;
    }

    const closeIndex = source.indexOf(">", index + 1);
    if (closeIndex === -1) {
      return false;
    }

    const tag = source.slice(index, closeIndex + 1);
    const tagName = tag.match(/^<\/?\s*([A-Za-z][\w:-]*)/)?.[1]?.toLowerCase();
    if (!tagName) {
      continue;
    }

    if (tag.startsWith("</")) {
      if (stack.pop() !== tagName) {
        return false;
      }
    } else if (!isSelfClosingTag(tag)) {
      stack.push(tagName);
    }

    index = closeIndex;
  }

  return stack.length === 0;
}
