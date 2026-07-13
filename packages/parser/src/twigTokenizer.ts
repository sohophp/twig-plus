export type TwigTokenType = "output" | "tag" | "comment";

export interface TwigToken {
  type: TwigTokenType;
  raw: string;
  inner: string;
  start: number;
  end: number;
}

export type TwigLexemeKind =
  | "name" | "number" | "string" | "operator" | "punctuation"
  | "whitespace" | "comment" | "unknown" | "eof";

export interface TwigLexeme {
  kind: TwigLexemeKind;
  value: string;
  start: number;
  end: number;
  complete: boolean;
}

const WORD_OPERATORS = new Set(["and", "or", "xor", "not", "in", "is", "matches", "starts", "ends", "with", "has", "some", "every", "b-and", "b-xor", "b-or"]);
const THREE_CHARACTER_OPERATORS = new Set(["===", "!==", "<=>", "..."]);
const TWO_CHARACTER_OPERATORS = new Set(["==", "!=", ">=", "<=", "=>", "..", "**", "//", "??", "?:", "?."]);

export function tokenizeTwig(source: string): TwigToken[] {
  const tokens: TwigToken[] = [];
  for (let start = 0; start < source.length;) {
    const opening = source.slice(start, start + 2);
    if (opening !== "{{" && opening !== "{%" && opening !== "{#") {
      start += 1;
      continue;
    }
    const closing = opening === "{{" ? "}}" : opening === "{%" ? "%}" : "#}";
    const closingStart = findDelimiter(source, start + 2, closing, opening === "{#");
    const end = closingStart < 0 ? source.length : closingStart + 2;
    const raw = source.slice(start, end);
    const type: TwigTokenType = opening === "{{" ? "output" : opening === "{%" ? "tag" : "comment";
    tokens.push({ type, raw, inner: source.slice(start + 2, closingStart < 0 ? end : end - 2), start, end });
    start = Math.max(end, start + 2);
  }
  return tokens;
}

/** Tokenize the contents of a Twig construct while preserving trivia and offsets. */
export function lexTwig(source: string, baseOffset = 0): TwigLexeme[] {
  const tokens: TwigLexeme[] = [];
  let index = 0;
  while (index < source.length) {
    const start = index;
    const character = source[index];
    if (/\s/.test(character)) {
      while (index < source.length && /\s/.test(source[index])) index += 1;
      tokens.push(makeLexeme("whitespace", source, start, index, baseOffset));
    } else if (character === "#") {
      while (index < source.length && source[index] !== "\n" && source[index] !== "\r") index += 1;
      tokens.push(makeLexeme("comment", source, start, index, baseOffset));
    } else if (/[A-Za-z_]/.test(character)) {
      while (index < source.length && /[A-Za-z0-9_-]/.test(source[index])) index += 1;
      const value = source.slice(start, index);
      tokens.push(makeLexeme(WORD_OPERATORS.has(value.toLowerCase()) ? "operator" : "name", source, start, index, baseOffset));
    } else if (/\d/.test(character)) {
      while (index < source.length && /[0-9_]/.test(source[index])) index += 1;
      if (source[index] === "." && /\d/.test(source[index + 1] ?? "")) {
        index += 1;
        while (index < source.length && /[0-9_]/.test(source[index])) index += 1;
      }
      tokens.push(makeLexeme("number", source, start, index, baseOffset));
    } else if (character === "'" || character === '"') {
      const quote = character;
      index += 1;
      let complete = false;
      while (index < source.length) {
        if (source[index] === "\\") index += Math.min(2, source.length - index);
        else if (source[index] === quote) { index += 1; complete = true; break; }
        else index += 1;
      }
      tokens.push({ ...makeLexeme("string", source, start, index, baseOffset), complete });
    } else {
      const triple = source.slice(index, index + 3);
      const pair = source.slice(index, index + 2);
      if (THREE_CHARACTER_OPERATORS.has(triple)) index += 3;
      else if (TWO_CHARACTER_OPERATORS.has(pair)) index += 2;
      else index += 1;
      const value = source.slice(start, index);
      const kind: TwigLexemeKind = THREE_CHARACTER_OPERATORS.has(value) || TWO_CHARACTER_OPERATORS.has(value) || "+-*/%~|=<>!?".includes(value)
        ? "operator"
        : "()[]{},.:".includes(value) ? "punctuation" : "unknown";
      tokens.push(makeLexeme(kind, source, start, index, baseOffset));
    }
  }
  tokens.push({ kind: "eof", value: "", start: baseOffset + source.length, end: baseOffset + source.length, complete: true });
  return tokens;
}

function makeLexeme(kind: TwigLexemeKind, source: string, start: number, end: number, base: number): TwigLexeme {
  return { kind, value: source.slice(start, end), start: base + start, end: base + end, complete: true };
}

function findDelimiter(source: string, start: number, closing: string, comment: boolean): number {
  if (comment) return source.indexOf(closing, start);
  let quote: string | null = null;
  let inlineComment = false;
  for (let index = start; index < source.length - 1; index += 1) {
    const character = source[index];
    if (inlineComment) {
      if (character === "\n" || character === "\r") inlineComment = false;
    } else if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = null;
    } else if (character === "'" || character === '"') quote = character;
    else if (character === "#") inlineComment = true;
    else if (source.startsWith(closing, index)) return index;
  }
  return -1;
}
