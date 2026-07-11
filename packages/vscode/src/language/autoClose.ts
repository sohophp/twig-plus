export interface TwigAutoCloseEdit {
  cursorOffset: number;
  replacement: string;
  replaceLength: number;
}

export interface TwigAutoCloseEditAtOffset extends TwigAutoCloseEdit {
  startOffset: number;
}

export interface TwigEnterEdit {
  cursorColumn: number;
  replacement: string;
}

export interface TwigSpacingEdit {
  cursorColumn: number;
  replacement: string;
  tokenEnd: number;
  tokenStart: number;
}

export interface InsertTextEdit {
  cursorOffsetDelta: number;
  insertText: string;
}

export function getTwigAutoCloseBacktrack(
  changeText: string,
  previousCharacter: string
): number | null {
  if (["{%", "{{", "{#"].includes(changeText)) {
    return 0;
  }

  if (["%}", "}}", "#}"].includes(changeText) && previousCharacter === "{") {
    return -1;
  }

  return null;
}

const OPENING_TO_CLOSING: Record<string, string> = {
  if: "endif",
  for: "endfor",
  block: "endblock",
  embed: "endembed",
  macro: "endmacro",
  apply: "endapply",
  filter: "endfilter",
  autoescape: "endautoescape",
  with: "endwith",
  spaceless: "endspaceless",
  set: "endset"
};

const INLINE_OPENING_TO_CLOSING: Record<string, string> = {
  "{{": "}}",
  "{#": "#}"
};

export function getTwigAutoCloseEdit(currentText: string): TwigAutoCloseEdit | null {
  const normalizedCurrentText = currentText.trimEnd();

  if (normalizedCurrentText.startsWith("{%")) {
    return {
      replacement: "{%  %}",
      replaceLength: getReplaceLength(currentText, ["{% %}", "{%%}", "{%}", "{%"]),
      cursorOffset: 3
    };
  }

  if (normalizedCurrentText.startsWith("{{")) {
    return {
      replacement: "{{  }}",
      replaceLength: getReplaceLength(currentText, ["{{ }}", "{{}}", "{{}", "{{"]),
      cursorOffset: 3
    };
  }

  if (normalizedCurrentText.startsWith("{#")) {
    return {
      replacement: "{#  #}",
      replaceLength: getReplaceLength(currentText, ["{# #}", "{##}", "{#}", "{#"]),
      cursorOffset: 3
    };
  }

  return null;
}

export function getTwigAutoCloseEditAtOffset(
  source: string,
  cursorOffset: number
): TwigAutoCloseEditAtOffset | null {
  const searchStart = Math.max(0, cursorOffset - 4);
  let bestEdit: TwigAutoCloseEditAtOffset | null = null;

  for (let startOffset = searchStart; startOffset <= cursorOffset; startOffset += 1) {
    const currentText = source.slice(
      startOffset,
      Math.min(startOffset + 6, source.length)
    );
    const edit = getTwigAutoCloseEdit(currentText);

    if (!edit) {
      continue;
    }

    const replaceEnd = startOffset + edit.replaceLength;
    if (cursorOffset < startOffset + 2 || cursorOffset > replaceEnd) {
      continue;
    }

    const existingText = source.slice(startOffset, startOffset + edit.replacement.length);
    if (existingText === edit.replacement) {
      continue;
    }

    bestEdit = {
      ...edit,
      startOffset
    };
  }

  return bestEdit;
}

export function getTwigExpressionPairAutoCloseEdit(
  source: string,
  cursorOffset: number
): InsertTextEdit | null {
  if (cursorOffset === 0) {
    return null;
  }

  const openingCharacter = source[cursorOffset - 1];
  const closingCharacter = getTwigExpressionClosingCharacter(openingCharacter);
  if (!closingCharacter || source[cursorOffset] === closingCharacter) {
    return null;
  }

  const tokenStart = Math.max(
    source.lastIndexOf("{{", cursorOffset),
    source.lastIndexOf("{%", cursorOffset),
    source.lastIndexOf("{#", cursorOffset)
  );

  if (tokenStart === -1) {
    return null;
  }

  const tokenEnd = findTwigTokenEnd(source, tokenStart);
  if (tokenEnd === -1 || cursorOffset > tokenEnd) {
    return null;
  }

  const suffix = source.slice(cursorOffset, tokenEnd);
  if (!isSafeTwigExpressionPairSuffix(suffix, openingCharacter)) {
    return null;
  }

  return {
    insertText: closingCharacter,
    cursorOffsetDelta: 0
  };
}

export function getHtmlAutoCloseTagEdit(
  source: string,
  cursorOffset: number
): InsertTextEdit | null {
  if (cursorOffset === 0 || source[cursorOffset - 1] !== ">") {
    return null;
  }

  const lineStart = source.lastIndexOf("\n", cursorOffset - 1) + 1;
  const linePrefix = source.slice(lineStart, cursorOffset);
  const openingTag = getLastHtmlOpeningTag(linePrefix);

  if (!openingTag || isVoidHtmlTag(openingTag.tagName) || openingTag.selfClosing) {
    return null;
  }

  if (source.slice(cursorOffset).startsWith(`</${openingTag.tagName}>`)) {
    return null;
  }

  return {
    insertText: `</${openingTag.tagName}>`,
    cursorOffsetDelta: 0
  };
}

export function getHtmlAttributeQuoteAutoCloseEdit(
  source: string,
  cursorOffset: number
): InsertTextEdit | null {
  if (cursorOffset === 0 || source[cursorOffset - 1] !== "=") {
    return null;
  }

  if (isInsideTwigToken(source, cursorOffset)) {
    return null;
  }

  const lineStart = source.lastIndexOf("\n", cursorOffset - 1) + 1;
  const linePrefix = source.slice(lineStart, cursorOffset);
  const tagStart = linePrefix.lastIndexOf("<");
  if (tagStart === -1) {
    return null;
  }

  const tagText = linePrefix.slice(tagStart);
  if (
    /^<\//.test(tagText) ||
    /^<!/.test(tagText) ||
    /^<\?/.test(tagText) ||
    tagText.includes(">")
  ) {
    return null;
  }

  if (hasUnclosedQuote(tagText)) {
    return null;
  }

  if (!/^<[A-Za-z][\w:-]*(?:\s[\s\S]*)?\s[A-Za-z_:][\w:.-]*=$/.test(tagText)) {
    return null;
  }

  const nextCharacter = source[cursorOffset] ?? "";
  if (nextCharacter === "\"" || nextCharacter === "'") {
    return null;
  }

  const shouldSeparateFromNextToken =
    nextCharacter !== "" &&
    !/\s/.test(nextCharacter) &&
    nextCharacter !== ">" &&
    nextCharacter !== "/";

  return {
    insertText: shouldSeparateFromNextToken ? "\"\" " : "\"\"",
    cursorOffsetDelta: 1
  };
}

export function getTwigEnterEdit(
  previousLineText: string,
  currentLineText: string,
  indentUnit: string
): TwigEnterEdit | null {
  const previousTrimmed = previousLineText.trim();
  const currentTrimmed = currentLineText.trim();

  const openingTag = getOpeningTagName(previousTrimmed);
  const closingTag = getClosingTagName(currentTrimmed);
  const inlineOpening = getInlineOpeningDelimiter(previousTrimmed);
  const inlineClosing = getInlineClosingDelimiter(currentTrimmed);

  if (openingTag && closingTag) {
    if (OPENING_TO_CLOSING[openingTag] !== closingTag) {
      return null;
    }
  } else if (inlineOpening && inlineClosing) {
    if (INLINE_OPENING_TO_CLOSING[inlineOpening] !== inlineClosing) {
      return null;
    }
  } else {
    return null;
  }

  const baseIndent = previousLineText.match(/^\s*/)?.[0] ?? "";
  const currentIndent = currentLineText.match(/^\s*/)?.[0] ?? "";
  const normalizedCurrentLine = `${baseIndent}${currentTrimmed}`;

  if (currentLineText !== normalizedCurrentLine && currentIndent !== baseIndent) {
    return null;
  }

  return {
    replacement: `${baseIndent}${indentUnit}\n${baseIndent}${currentTrimmed}`,
    cursorColumn: (baseIndent + indentUnit).length
  };
}

export function getTwigSpacingEdit(
  lineText: string,
  cursorColumn: number
): TwigSpacingEdit | null {
  const tokenPattern = /(\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}|\{#[\s\S]*?#\})/g;

  for (const match of lineText.matchAll(tokenPattern)) {
    const token = match[0];
    const tokenStart = match.index ?? 0;
    const tokenEnd = tokenStart + token.length;

    if (cursorColumn < tokenStart || cursorColumn > tokenEnd) {
      continue;
    }

    const normalized = normalizeTwigTokenSpacing(token);
    if (!normalized || normalized === token) {
      return null;
    }

    return {
      tokenStart,
      tokenEnd,
      replacement: normalized,
      cursorColumn: tokenStart + normalized.length
    };
  }

  return null;
}

function getReplaceLength(currentText: string, candidates: string[]): number {
  for (const candidate of candidates) {
    if (currentText.startsWith(candidate)) {
      return candidate.length;
    }
  }

  return Math.min(currentText.length, candidates.at(-1)?.length ?? 0);
}

function findTwigTokenEnd(source: string, tokenStart: number): number {
  const opening = source.slice(tokenStart, tokenStart + 2);
  const closing =
    opening === "{{" ? "}}" : opening === "{%" ? "%}" : opening === "{#" ? "#}" : null;

  if (!closing) {
    return -1;
  }

  return source.indexOf(closing, tokenStart + 2);
}

function getTwigExpressionClosingCharacter(openingCharacter: string): string | null {
  if (openingCharacter === "(") {
    return ")";
  }

  if (openingCharacter === "{") {
    return "}";
  }

  return null;
}

function isSafeTwigExpressionPairSuffix(
  suffix: string,
  openingCharacter: string
): boolean {
  if (/^\s*$/.test(suffix)) {
    return true;
  }

  if (openingCharacter === "{") {
    return /^[)\]}]\s*$/.test(suffix);
  }

  return false;
}

function isInsideTwigToken(source: string, cursorOffset: number): boolean {
  const tokenStart = Math.max(
    source.lastIndexOf("{{", cursorOffset),
    source.lastIndexOf("{%", cursorOffset),
    source.lastIndexOf("{#", cursorOffset)
  );

  if (tokenStart === -1 || cursorOffset <= tokenStart) {
    return false;
  }

  const tokenEnd = findTwigTokenEnd(source, tokenStart);
  return tokenEnd === -1 || cursorOffset <= tokenEnd;
}

function getLastHtmlOpeningTag(linePrefix: string): {
  selfClosing: boolean;
  tagName: string;
} | null {
  const tagStart = linePrefix.lastIndexOf("<");
  if (tagStart === -1) {
    return null;
  }

  const tagText = linePrefix.slice(tagStart);
  if (/^<\//.test(tagText) || !tagText.endsWith(">")) {
    return null;
  }

  if (hasUnclosedQuote(tagText)) {
    return null;
  }

  const match = tagText.match(/^<([A-Za-z][\w:-]*)(?:\s[\s\S]*)?>$/);
  if (!match) {
    return null;
  }

  return {
    tagName: match[1].toLowerCase(),
    selfClosing: /\/\s*>$/.test(tagText)
  };
}

function hasUnclosedQuote(value: string): boolean {
  let quote: "\"" | "'" | null = null;

  for (const char of value) {
    if (quote) {
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
    }
  }

  return quote !== null;
}

function isVoidHtmlTag(tagName: string): boolean {
  return [
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr"
  ].includes(tagName);
}

function getOpeningTagName(line: string): string | null {
  const match = line.match(/^\{%\s*([A-Za-z_][A-Za-z0-9_]*)\b[\s\S]*%\}$/);
  const tagName = match?.[1]?.toLowerCase();

  if (!tagName || !(tagName in OPENING_TO_CLOSING)) {
    return null;
  }

  return tagName;
}

function getClosingTagName(line: string): string | null {
  const match = line.match(/^\{%\s*(end[A-Za-z_][A-Za-z0-9_]*)\s*%\}$/);
  return match?.[1]?.toLowerCase() ?? null;
}

function getInlineOpeningDelimiter(line: string): string | null {
  if (line === "{{" || line === "{#") {
    return line;
  }

  return null;
}

function getInlineClosingDelimiter(line: string): string | null {
  if (line === "}}" || line === "#}") {
    return line;
  }

  return null;
}

function normalizeTwigTokenSpacing(token: string): string | null {
  const match = token.match(/^(\{\{|\{%|\{#)\s*([\s\S]*?)\s*(\}\}|%\}|#\})$/);
  if (!match) {
    return null;
  }

  const [, opening, inner, closing] = match;
  const normalizedInner = inner.trim();

  if (!normalizedInner) {
    return `${opening}  ${closing}`;
  }

  return `${opening} ${normalizedInner} ${closing}`;
}
