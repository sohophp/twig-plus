import { getTwigTagKind, getTwigTagName } from "./twigStructure";
import { tokenizeTwig } from "./twigTokenizer";

export interface SourceRange {
  start: number;
  end: number;
}

interface PairedRange extends SourceRange {
  openEnd: number;
  closeStart: number;
}

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

const WORD_CHARACTER = /[A-Za-z0-9_:-]/;
const HTML_TAG_PATTERN =
  /<\/?[A-Za-z][\w:-]*(?:"[^"]*"|'[^']*'|[^'"<>])*?>/g;

export function collectSelectionRanges(
  source: string,
  offset: number
): SourceRange[] {
  const candidates: SourceRange[] = [];

  pushWordRange(source, offset, candidates);
  pushLineRange(source, offset, candidates);
  pushTwigTokenRanges(source, offset, candidates);
  pushPairedRanges(source, collectTwigPairedRanges(source), offset, candidates);
  pushPairedRanges(source, collectHtmlPairedRanges(source), offset, candidates);
  candidates.push({
    start: 0,
    end: source.length
  });

  return normalizeSelectionRanges(candidates, offset, source.length);
}

function pushWordRange(
  source: string,
  offset: number,
  candidates: SourceRange[]
): void {
  if (!source.length) {
    return;
  }

  const index = Math.min(Math.max(offset, 0), source.length - 1);
  if (!WORD_CHARACTER.test(source[index])) {
    return;
  }

  let start = index;
  let end = index + 1;

  while (start > 0 && WORD_CHARACTER.test(source[start - 1])) {
    start -= 1;
  }

  while (end < source.length && WORD_CHARACTER.test(source[end])) {
    end += 1;
  }

  candidates.push({ start, end });
}

function pushLineRange(
  source: string,
  offset: number,
  candidates: SourceRange[]
): void {
  const lineStart = source.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
  const nextNewline = source.indexOf("\n", offset);
  const lineEnd = nextNewline === -1 ? source.length : nextNewline;
  const lineText = source.slice(lineStart, lineEnd);
  const trimmedStart = lineText.search(/\S/);

  if (trimmedStart === -1) {
    return;
  }

  const trailingWhitespace = lineText.match(/\s*$/)?.[0] ?? "";
  const trimmedEnd = lineText.length - trailingWhitespace.length;
  candidates.push({
    start: lineStart + trimmedStart,
    end: lineStart + trimmedEnd
  });
}

function pushTwigTokenRanges(
  source: string,
  offset: number,
  candidates: SourceRange[]
): void {
  for (const token of tokenizeTwig(source)) {
    if (!containsOffset(token, offset)) {
      continue;
    }

    const innerRange = getTwigInnerRange(token.raw, token.start, token.end);
    if (innerRange && containsOffset(innerRange, offset)) {
      candidates.push(innerRange);
    }

    candidates.push({
      start: token.start,
      end: token.end
    });
  }
}

function pushPairedRanges(
  source: string,
  pairs: PairedRange[],
  offset: number,
  candidates: SourceRange[]
): void {
  for (const pair of pairs) {
    if (!containsOffset(pair, offset)) {
      continue;
    }

    if (
      offset >= pair.openEnd &&
      offset <= pair.closeStart &&
      pair.openEnd < pair.closeStart
    ) {
      const bodyRange = trimWhitespaceRange(source, {
        start: pair.openEnd,
        end: pair.closeStart
      });
      if (bodyRange) {
        candidates.push(bodyRange);
      }
    }

    candidates.push({
      start: pair.start,
      end: pair.end
    });
  }
}

function collectTwigPairedRanges(source: string): PairedRange[] {
  const stack: Array<{ name: string; start: number; openEnd: number }> = [];
  const ranges: PairedRange[] = [];

  for (const token of tokenizeTwig(source)) {
    if (token.type !== "tag") {
      continue;
    }

    const content = normalizeTwigInner(token.inner);
    const tagName = getTwigTagName(content);
    if (!tagName) {
      continue;
    }

    const tagKind = getTwigTagKind(content);
    if (tagKind === "opening") {
      stack.push({
        name: tagName,
        start: token.start,
        openEnd: token.end
      });
      continue;
    }

    if (tagKind !== "closing") {
      continue;
    }

    const openingName = CLOSING_TO_OPENING[tagName];
    if (!openingName) {
      continue;
    }

    const stackIndex = findLastIndex(stack, (entry) => entry.name === openingName);
    if (stackIndex === -1) {
      continue;
    }

    const opening = stack.splice(stackIndex, 1)[0];
    ranges.push({
      start: opening.start,
      openEnd: opening.openEnd,
      closeStart: token.start,
      end: token.end
    });
  }

  return ranges;
}

function collectHtmlPairedRanges(source: string): PairedRange[] {
  const stack: Array<{ tagName: string; start: number; openEnd: number }> = [];
  const ranges: PairedRange[] = [];

  for (const match of source.matchAll(HTML_TAG_PATTERN)) {
    const raw = match[0];
    const start = match.index ?? 0;
    const end = start + raw.length;

    if (raw.startsWith("</")) {
      const tagName = raw.slice(2).match(/^([A-Za-z][\w:-]*)/)?.[1]?.toLowerCase();
      if (!tagName) {
        continue;
      }

      const stackIndex = findLastIndex(stack, (entry) => entry.tagName === tagName);
      if (stackIndex === -1) {
        continue;
      }

      const opening = stack.splice(stackIndex, 1)[0];
      ranges.push({
        start: opening.start,
        openEnd: opening.openEnd,
        closeStart: start,
        end
      });
      continue;
    }

    if (isSelfClosingHtmlTag(raw)) {
      continue;
    }

    const tagName = raw.slice(1).match(/^([A-Za-z][\w:-]*)/)?.[1]?.toLowerCase();
    if (!tagName) {
      continue;
    }

    stack.push({
      tagName,
      start,
      openEnd: end
    });
  }

  return ranges;
}

function getTwigInnerRange(
  raw: string,
  start: number,
  end: number
): SourceRange | null {
  const prefixLength = raw[2] === "-" || raw[2] === "~" ? 3 : 2;
  const suffixLength =
    raw[raw.length - 3] === "-" || raw[raw.length - 3] === "~" ? 3 : 2;
  const innerStart = start + prefixLength;
  const innerEnd = end - suffixLength;

  const trimmedRange = trimWhitespaceRange(raw, {
    start: prefixLength,
    end: raw.length - suffixLength
  });
  if (!trimmedRange) {
    return null;
  }

  return {
    start: start + trimmedRange.start,
    end: start + trimmedRange.end
  };
}

function normalizeSelectionRanges(
  candidates: SourceRange[],
  offset: number,
  sourceLength: number
): SourceRange[] {
  const unique = new Map<string, SourceRange>();

  for (const candidate of candidates) {
    const start = Math.max(0, Math.min(candidate.start, sourceLength));
    const end = Math.max(start, Math.min(candidate.end, sourceLength));

    if (start === end || !containsOffset({ start, end }, offset)) {
      continue;
    }

    unique.set(`${start}:${end}`, { start, end });
  }

  const sorted = [...unique.values()].sort((left, right) => {
    const leftLength = left.end - left.start;
    const rightLength = right.end - right.start;

    if (leftLength !== rightLength) {
      return leftLength - rightLength;
    }

    if (left.start !== right.start) {
      return left.start - right.start;
    }

    return left.end - right.end;
  });

  const nested: SourceRange[] = [];

  for (const range of sorted) {
    const previous = nested.at(-1);
    if (!previous || containsRange(range, previous)) {
      nested.push(range);
    }
  }

  return nested;
}

function trimWhitespaceRange(
  source: string,
  range: SourceRange
): SourceRange | null {
  let { start, end } = range;

  while (start < end && /\s/.test(source[start])) {
    start += 1;
  }

  while (end > start && /\s/.test(source[end - 1])) {
    end -= 1;
  }

  if (start >= end) {
    return null;
  }

  return { start, end };
}

function containsOffset(range: SourceRange, offset: number): boolean {
  return offset >= range.start && offset <= range.end;
}

function containsRange(outer: SourceRange, inner: SourceRange): boolean {
  return outer.start <= inner.start && outer.end >= inner.end;
}

function normalizeTwigInner(inner: string): string {
  return inner.trim().replace(/^[-~]\s*/, "").replace(/\s*[-~]$/, "");
}

function isSelfClosingHtmlTag(tag: string): boolean {
  return (
    /\/>$/.test(tag) ||
    /^<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)\b/i.test(
      tag
    )
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
