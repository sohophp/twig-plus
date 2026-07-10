import {
  getLeadingDedentCount,
  getLineIndentDeltaAfterLeading,
  getStandaloneTwigTagContent,
  getTwigTagKind
} from "@twig-plus/parser";

export interface FormatterOptions {
  profile: "phpstorm" | "compact";
  indentSize: number;
  printWidth: number;
  useTabs: boolean;
  twigTagSpacing: boolean;
  htmlAttributeWrap: "preserve" | "auto" | "force";
  preserveSingleLineBlocks: boolean;
  lineBreakAfterTwigControlTag: boolean;
}

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
  return value.trim().replace(/\s+/g, " ").replace(/,\s*/g, ", ");
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
  if (/^</.test(trailing)) {
    return true;
  }

  const twigTagMatch = trailing.match(/^(\{%-?[\s\S]*?-?%\})\s*(\S[\s\S]*)$/);
  if (!twigTagMatch) {
    return false;
  }

  const [, twigTag, remainder] = twigTagMatch;
  const content = getStandaloneTwigTagContent(twigTag);
  return Boolean(content && shouldBreakAfterInlineTwigDirective(content) && /^</.test(remainder));
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
  return /^<([A-Za-z][\w:-]*)(?:"[^"]*"|'[^']*'|[^'"<>])*?>\s*<([A-Za-z][\w:-]*)(?:"[^"]*"|'[^']*'|[^'"<>])*?>[\s\S]*<\/\2>\s*<\/\1>$/.test(
    line
  );
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
