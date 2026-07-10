import { tokenizeTwig } from "./twigTokenizer";

const OPENING_TAGS = new Set([
  "if",
  "for",
  "block",
  "embed",
  "macro",
  "apply",
  "filter",
  "autoescape",
  "with",
  "spaceless"
]);

const MIDDLE_TAGS = new Set([
  "else",
  "elseif",
  "empty"
]);

const CLOSING_TAGS = new Set([
  "endif",
  "endfor",
  "endblock",
  "endembed",
  "endmacro",
  "endapply",
  "endfilter",
  "endautoescape",
  "endwith",
  "endspaceless",
  "endset"
]);

const CLOSING_TO_OPENING: Record<string, string> = {
  endif: "if",
  endfor: "for",
  endblock: "block",
  endembed: "embed",
  endmacro: "macro",
  endapply: "apply",
  endfilter: "filter",
  endautoescape: "autoescape",
  endwith: "with",
  endspaceless: "spaceless",
  endset: "set"
};

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

export type TwigTagKind = "opening" | "middle" | "closing" | "inline";
export type LineTokenKind = "twig" | "html-open" | "html-close";

export interface LineToken {
  kind: LineTokenKind;
  raw: string;
  start: number;
  end: number;
  twigTagKind?: TwigTagKind;
}

export function getTwigTagName(content: string): string | null {
  const normalized = content.trim().replace(/^[-~]\s*/, "");
  const match = normalized.match(/^([a-zA-Z_][a-zA-Z0-9_]*)/);
  return match ? match[1].toLowerCase() : null;
}

export function isTwigOpeningTag(content: string): boolean {
  const name = getTwigTagName(content);
  return name !== null && (OPENING_TAGS.has(name) || isTwigSetCaptureTag(content));
}

export function isTwigMiddleTag(content: string): boolean {
  const name = getTwigTagName(content);
  return name !== null && MIDDLE_TAGS.has(name);
}

export function isTwigClosingTag(content: string): boolean {
  const name = getTwigTagName(content);
  return name !== null && CLOSING_TAGS.has(name);
}

export function getTwigTagKind(content: string): TwigTagKind {
  if (isTwigMiddleTag(content)) {
    return "middle";
  }

  if (isTwigClosingTag(content)) {
    return "closing";
  }

  if (isTwigOpeningTag(content)) {
    return "opening";
  }

  return "inline";
}

export function getStandaloneTwigTagContent(line: string): string | null {
  const trimmed = line.trim();
  const match = trimmed.match(/^\{%-?([\s\S]*?)-?%\}$/);
  return match ? match[1].trim() : null;
}

export function getLeadingDedentCount(line: string): number {
  return getLeadingDedentTokenCount(extractLineTokens(line), line);
}

export function getLineIndentDeltaAfterLeading(line: string): number {
  const tokens = extractLineTokens(line);
  const leadingDedentTokens = getLeadingDedentTokenCount(tokens, line);
  let delta = 0;

  for (const [index, token] of tokens.entries()) {
    if (index < leadingDedentTokens && isLeadingDedentToken(token)) {
      if (token.twigTagKind === "middle") {
        delta += 1;
      }

      continue;
    }

    if (token.kind === "html-open") {
      delta += 1;
      continue;
    }

    if (token.kind === "html-close") {
      delta -= 1;
      continue;
    }

    if (token.twigTagKind === "opening" || token.twigTagKind === "middle") {
      delta += 1;
      continue;
    }

    if (token.twigTagKind === "closing") {
      delta -= 1;
    }
  }

  return delta;
}

export function collectUnclosedTwigControlTags(
  source: string,
  offset: number
): string[] {
  const stack: string[] = [];

  for (const token of tokenizeTwig(source)) {
    if (token.start >= offset || token.type !== "tag") {
      continue;
    }

    const content = token.inner.trim().replace(/^[-~]\s*/, "").replace(/\s*[-~]$/, "");
    const tagName = getTwigTagName(content);

    if (!tagName) {
      continue;
    }

    const tagKind = getTwigTagKind(content);
    if (tagKind === "opening") {
      stack.push(tagName);
      continue;
    }

    if (tagKind !== "closing") {
      continue;
    }

    const openingTag = CLOSING_TO_OPENING[tagName];
    if (!openingTag) {
      continue;
    }

    const openIndex = stack.lastIndexOf(openingTag);
    if (openIndex >= 0) {
      stack.splice(openIndex, 1);
    }
  }

  return stack;
}

export function getTwigCompletionContext(
  source: string,
  offset: number
): {
  unclosedTags: string[];
  topLevelTag: string | null;
  allowedMiddleTags: string[];
  preferredClosingTags: string[];
} {
  const stack: Array<{
    name: string;
    middleTags: string[];
  }> = [];

  for (const token of tokenizeTwig(source)) {
    if (token.start >= offset || token.type !== "tag") {
      continue;
    }

    const content = token.inner.trim().replace(/^[-~]\s*/, "").replace(/\s*[-~]$/, "");
    const tagName = getTwigTagName(content);

    if (!tagName) {
      continue;
    }

    const tagKind = getTwigTagKind(content);

    if (tagKind === "opening") {
      stack.push({
        name: tagName,
        middleTags: []
      });
      continue;
    }

    if (tagKind === "middle") {
      const stackIndex = findLastIndex(stack, (entry) =>
        isCompatibleMiddleTag(entry.name, tagName)
      );

      if (stackIndex >= 0) {
        stack[stackIndex].middleTags.push(tagName);
      }

      continue;
    }

    if (tagKind !== "closing") {
      continue;
    }

    const openingTag = CLOSING_TO_OPENING[tagName];
    if (!openingTag) {
      continue;
    }

    const openIndex = findLastIndex(stack, (entry) => entry.name === openingTag);
    if (openIndex >= 0) {
      stack.splice(openIndex, 1);
    }
  }

  const unclosedTags = stack.map((entry) => entry.name);
  const topLevel = stack.at(-1);
  const topLevelTag = topLevel?.name ?? null;

  return {
    unclosedTags,
    topLevelTag,
    allowedMiddleTags: getAllowedMiddleTags(topLevel?.name ?? null, topLevel?.middleTags ?? []),
    preferredClosingTags: getPreferredClosingTags(unclosedTags)
  };
}

function isSelfClosingTag(tag: string): boolean {
  return /\/>$/.test(tag) || /^<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)\b/i.test(tag);
}

function isTwigSetCaptureTag(content: string): boolean {
  const normalized = content.trim().replace(/^[-~]\s*/, "");

  if (!/^set\b/i.test(normalized)) {
    return false;
  }

  return !normalized.includes("=");
}

function getAllowedMiddleTags(
  topLevelTag: string | null,
  seenMiddleTags: string[]
): string[] {
  if (topLevelTag === "if") {
    if (seenMiddleTags.includes("else")) {
      return [];
    }

    return ["else", "elseif"];
  }

  if (topLevelTag === "for") {
    if (seenMiddleTags.includes("else") || seenMiddleTags.includes("empty")) {
      return [];
    }

    return ["else", "empty"];
  }

  return [];
}

function getPreferredClosingTags(unclosedTags: string[]): string[] {
  const seen = new Set<string>();
  const closingTags: string[] = [];

  for (const tagName of [...unclosedTags].reverse()) {
    const closingTag = OPENING_TO_CLOSING[tagName];
    if (!closingTag || seen.has(closingTag)) {
      continue;
    }

    seen.add(closingTag);
    closingTags.push(closingTag);
  }

  return closingTags;
}

function isCompatibleMiddleTag(openingTag: string, middleTag: string): boolean {
  return (
    (openingTag === "if" && (middleTag === "else" || middleTag === "elseif")) ||
    (openingTag === "for" && (middleTag === "else" || middleTag === "empty"))
  );
}

function findLastIndex<T>(
  items: T[],
  predicate: (item: T) => boolean
): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) {
      return index;
    }
  }

  return -1;
}

function getLeadingDedentTokenCount(tokens: LineToken[], line: string): number {
  const trimmedStart = line.trimStart();

  if (!trimmedStart) {
    return 0;
  }

  let cursor = line.length - trimmedStart.length;
  let dedentCount = 0;

  for (const token of tokens) {
    const between = line.slice(cursor, token.start);

    if (between.trim() || !isLeadingDedentToken(token)) {
      break;
    }

    dedentCount += 1;
    break;
  }

  return dedentCount;
}

function isLeadingDedentToken(token: LineToken): boolean {
  if (token.kind === "html-close") {
    return true;
  }

  return (
    token.kind === "twig" &&
    (token.twigTagKind === "closing" || token.twigTagKind === "middle")
  );
}

function extractLineTokens(line: string): LineToken[] {
  const tokens: LineToken[] = [];
  const pattern = /\{\{[-~]?[\s\S]*?[-~]?\}\}|\{%-?[\s\S]*?-?%\}|\{#-?[\s\S]*?-?#\}|<\/?[A-Za-z][\w:-]*(?:"[^"]*"|'[^']*'|[^'"<>])*?>/g;

  for (const match of line.matchAll(pattern)) {
    const raw = match[0];
    const start = match.index ?? 0;
    const end = start + raw.length;

    if (raw.startsWith("{%")) {
      const content = raw.replace(/^\{%-?/, "").replace(/-?%\}$/, "").trim();
      tokens.push({
        kind: "twig",
        raw,
        start,
        end,
        twigTagKind: getTwigTagKind(content)
      });
      continue;
    }

    if (raw.startsWith("{{") || raw.startsWith("{#")) {
      tokens.push({
        kind: "twig",
        raw,
        start,
        end,
        twigTagKind: "inline"
      });
      continue;
    }

    if (raw.startsWith("</")) {
      tokens.push({
        kind: "html-close",
        raw,
        start,
        end
      });
      continue;
    }

    if (!isSelfClosingTag(raw)) {
      tokens.push({
        kind: "html-open",
        raw,
        start,
        end
      });
    }
  }

  return tokens;
}
