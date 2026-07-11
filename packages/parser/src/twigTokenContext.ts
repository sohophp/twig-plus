import { tokenizeTwig, type TwigTokenType } from "./twigTokenizer";

export type TwigTokenContextKind = TwigTokenType | "html";

export interface TwigTokenContext {
  kind: TwigTokenContextKind;
  stringLike: boolean;
  hashKeyLike: boolean;
}

export function getTwigTokenContextAtOffset(
  source: string,
  offset: number
): TwigTokenContext {
  for (const token of tokenizeTwig(source)) {
    if (offset < token.start || offset > token.end) {
      continue;
    }

    if (token.type === "comment") {
      return {
        kind: "comment",
        stringLike: false,
        hashKeyLike: false
      };
    }

    const innerStart = getTokenInnerStartOffset(token.raw, token.start);
    const innerPrefix = source.slice(innerStart, Math.max(innerStart, offset));
    const stringLike = isInsideQuotedString(innerPrefix);

    return {
      kind: token.type,
      stringLike,
      hashKeyLike: !stringLike && isHashKeyLikePrefix(innerPrefix)
    };
  }

  return {
    kind: "html",
    stringLike: isInsideHtmlAttributeValue(source, offset),
    hashKeyLike: false
  };
}

function getTokenInnerStartOffset(raw: string, tokenStart: number): number {
  return tokenStart + (raw[2] === "-" || raw[2] === "~" ? 3 : 2);
}

function isInsideQuotedString(value: string): boolean {
  let quote: "\"" | "'" | null = null;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];

    if (quote) {
      if (char === "\\" && index + 1 < value.length) {
        index += 1;
        continue;
      }

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

function isHashKeyLikePrefix(innerPrefix: string): boolean {
  const withoutCurrentIdentifier = innerPrefix.replace(/[A-Za-z_][A-Za-z0-9_]*$/, "");
  const previousNonSpace = withoutCurrentIdentifier.match(/\S(?=\s*$)/)?.[0];

  return previousNonSpace === "{" || previousNonSpace === ",";
}

function isInsideHtmlAttributeValue(source: string, offset: number): boolean {
  const lineStart = Math.max(source.lastIndexOf("\n", offset - 1) + 1, 0);
  const linePrefix = source.slice(lineStart, offset);
  const lastOpenTag = linePrefix.lastIndexOf("<");
  const lastCloseTag = linePrefix.lastIndexOf(">");

  if (lastOpenTag === -1 || lastOpenTag < lastCloseTag) {
    return false;
  }

  return isInsideQuotedString(linePrefix.slice(lastOpenTag));
}
