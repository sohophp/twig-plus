export interface TwigAutoCloseEdit {
  cursorOffset: number;
  replacement: string;
  replaceLength: number;
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
