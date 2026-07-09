import {
  getLeadingDedentCount,
  getLineIndentDeltaAfterLeading
} from "./rules";

export interface FormatOptions {
  indentSize: number;
  printWidth: number;
  useTabs: boolean;
  twigTagSpacing: boolean;
  htmlAttributeWrap: "preserve" | "auto" | "force";
  preserveSingleLineBlocks: boolean;
}

export function printFormattedTwig(source: string, options: FormatOptions): string {
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
  options: FormatOptions,
  embeddedBlockTag: "script" | "style" | null
): string[] {
  if (embeddedBlockTag && !isEmbeddedClosingLine(normalized, embeddedBlockTag)) {
      const preservedIndent = rawLine.match(/^\s*/)?.[0] ?? "";
      return [getIndent(indentLevel, options) + preservedIndent + normalized];
    }

  const expanded = maybeExpandSingleLineBlock(normalized, indentLevel, options);
  if (expanded) {
    return expanded;
  }

  const wrapped = maybeWrapHtmlAttributes(normalized, indentLevel, options);
  if (wrapped) {
    return wrapped;
  }

  return [getIndent(indentLevel, options) + normalized];
}

function normalizeLine(line: string, options: FormatOptions): string {
  if (!options.twigTagSpacing) {
    return line;
  }

  return line.replace(
    /\{\{[-~]?[\s\S]*?[-~]?\}\}|\{%-?[\s\S]*?-?%\}|\{#-?[\s\S]*?-?#\}/g,
    (match) => normalizeTwigSegment(match)
  );
}

function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function getIndent(level: number, options: FormatOptions): string {
  if (options.useTabs) {
    return "\t".repeat(level);
  }

  return " ".repeat(level * options.indentSize);
}

function maybeExpandSingleLineBlock(
  line: string,
  indentLevel: number,
  options: FormatOptions
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

function maybeWrapHtmlAttributes(
  line: string,
  indentLevel: number,
  options: FormatOptions
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

function getNextEmbeddedBlockState(
  line: string,
  current: "script" | "style" | null
): "script" | "style" | null {
  if (current && isEmbeddedClosingLine(line, current)) {
    return null;
  }

  if (current) {
    return current;
  }

  if (/<script\b[^>]*>/i.test(line) && !/<\/script>/i.test(line)) {
    return "script";
  }

  if (/<style\b[^>]*>/i.test(line) && !/<\/style>/i.test(line)) {
    return "style";
  }

  return null;
}

function isEmbeddedClosingLine(
  line: string,
  tagName: "script" | "style"
): boolean {
  return new RegExp(`</${tagName}>`, "i").test(line);
}

function parseHtmlOpeningTag(line: string): {
  tagName: string;
  attributes: string[];
  selfClosing: boolean;
} | null {
  const match = line.match(/^<([A-Za-z][\w:-]*)([\s\S]*?)(\/?)>$/);

  if (!match || /^<\//.test(line) || /<\/[A-Za-z][\w:-]*>\s*$/.test(line)) {
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
