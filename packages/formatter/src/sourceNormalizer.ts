import type { HybridDocument, TwigNode } from "@twig-plus/parser";

export function normalizeTwigSourceFragments(source: string): string {
  return normalizeHtmlTagSpacing(normalizeTwigTokenFragments(source));
}

/** Normalize a parsed lossless document without rescanning Twig delimiters. */
export function normalizeHybridSource(document: HybridDocument): string {
  const pieces = document.children.map((node) => {
    if (isTwigNode(node)) return normalizeTwigNode(node);
    if ("embeddedTwig" in node && node.embeddedTwig.length) {
      let result = "";
      let offset = node.start;
      for (const twig of node.embeddedTwig) {
        result += document.source.slice(offset, twig.start) + normalizeTwigNode(twig);
        offset = twig.end;
      }
      return result + document.source.slice(offset, node.end);
    }
    return node.raw;
  });
  return normalizeHtmlTagSpacing(pieces.join(""));
}

function isTwigNode(node: HybridDocument["children"][number]): node is TwigNode {
  return node.kind === "TwigTag" || node.kind === "TwigOutput" || node.kind === "TwigComment" || (node.kind === "IncompleteNode" && "inner" in node);
}

function normalizeTwigNode(node: TwigNode): string {
  if (!node.complete || (!node.raw.includes("\n") && !/\s{2,}/.test(node.raw))) return node.raw;
  const opening = node.raw.slice(0, node.raw[2] === "-" || node.raw[2] === "~" ? 3 : 2);
  const closingLength = /[-~](?:\}\}|%\}|#\})$/.test(node.raw) ? 3 : 2;
  const closing = node.raw.slice(-closingLength);
  const normalizedInner = node.raw.slice(opening.length, -closingLength);
  const collapsed = normalizedInner.replace(/\r\n/g, "\n").replace(/\s*\n\s*/g, " ").replace(/\s*\|\s*/g, "|").replace(/\s+/g, " ").trim();
  return collapsed ? `${opening} ${collapsed} ${closing}` : opening + closing;
}

function normalizeTwigTokenFragments(source: string): string {
  return source.replace(
    /\{\{[-~]?[\s\S]*?[-~]?\}\}|\{%-?[\s\S]*?-?%\}|\{#-?[\s\S]*?-?#\}/g,
    (token) => {
      if (!token.includes("\n") && !/\s{2,}/.test(token)) {
        return token;
      }

      return token
        .replace(/\r\n/g, "\n")
        .replace(/\s*\n\s*/g, " ")
        .replace(/\s*\|\s*/g, "|")
        .replace(/\s+/g, " ");
    }
  );
}

function normalizeHtmlTagSpacing(source: string): string {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const output: string[] = [];
  let embeddedBlockTag: "script" | "style" | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    let line = lines[index];

    if (embeddedBlockTag) {
      output.push(line);
      if (isEmbeddedClosingLine(line, embeddedBlockTag)) {
        embeddedBlockTag = null;
      }
      continue;
    }

    const tagStart = findUnclosedHtmlOpeningTagStart(line);

    if (tagStart !== -1) {
      const pieces = [line.trimEnd()];
      let lookahead = index + 1;

      while (lookahead < lines.length) {
        const nextLine = lines[lookahead].trim();
        pieces.push(nextLine);

        if (containsHtmlTagEnd(nextLine)) {
          index = lookahead;
          line = collapseHtmlOpeningTagPieces(pieces);
          break;
        }

        lookahead += 1;
      }
    }

    const normalizedLine = normalizeInlineHtmlWhitespace(line);
    output.push(normalizedLine);
    embeddedBlockTag = getNextEmbeddedBlockTag(normalizedLine);
  }

  return output.join("\n");
}

function findUnclosedHtmlOpeningTagStart(line: string): number {
  const match = line.match(/<([A-Za-z][\w:-]*)(?=\s|>|$)/);
  if (!match || match.index === undefined) {
    return -1;
  }

  const fragment = line.slice(match.index);
  if (fragment.startsWith("</") || containsHtmlTagEnd(fragment)) {
    return -1;
  }

  return match.index;
}

function containsHtmlTagEnd(value: string): boolean {
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
      continue;
    }

    if (char === ">") {
      return true;
    }
  }

  return false;
}

function collapseHtmlOpeningTagPieces(pieces: string[]): string {
  return pieces
    .join(" ")
    .replace(/\s+/g, " ")
    .replace(/\s+>/g, ">")
    .trim();
}

function normalizeInlineHtmlWhitespace(line: string): string {
  return normalizeHtmlOpeningTags(line)
    .replace(/>\s+(\{\{)/g, ">$1")
    .replace(/(\}\})\s+</g, "$1<")
    .replace(/[ \t]+$/g, "");
}

function normalizeHtmlOpeningTags(line: string): string {
  let result = "";
  let index = 0;

  while (index < line.length) {
    const char = line[index];
    const next = line[index + 1];

    if (
      char !== "<" ||
      next === "/" ||
      next === "!" ||
      next === "?" ||
      !/[A-Za-z]/.test(next ?? "")
    ) {
      result += char;
      index += 1;
      continue;
    }

    const tagEnd = findHtmlTagEnd(line, index);
    if (tagEnd === -1) {
      result += char;
      index += 1;
      continue;
    }

    result += normalizeHtmlOpeningTag(line.slice(index, tagEnd + 1));
    index = tagEnd + 1;
  }

  return result;
}

interface HtmlAttributeToken {
  name: string;
  value?: string;
}

function normalizeHtmlOpeningTag(tag: string): string {
  const parsed = parseHtmlOpeningTag(tag);
  if (!parsed) {
    return tag;
  }

  const attributes = parsed.attributes.map((attribute) =>
    attribute.value === undefined
      ? attribute.name
      : `${attribute.name}=${attribute.value}`
  );
  const attributesSuffix = attributes.length > 0 ? ` ${attributes.join(" ")}` : "";
  const selfClosingSuffix = parsed.selfClosing ? " /" : "";

  return `<${parsed.tagName}${attributesSuffix}${selfClosingSuffix}>`;
}

function parseHtmlOpeningTag(tag: string): {
  tagName: string;
  attributes: HtmlAttributeToken[];
  selfClosing: boolean;
} | null {
  let index = 1;
  const tagNameMatch = tag.slice(index).match(/^([A-Za-z][\w:-]*)/);
  if (!tagNameMatch) {
    return null;
  }

  const tagName = tagNameMatch[1];
  index += tagName.length;
  const attributes: HtmlAttributeToken[] = [];
  let selfClosing = false;

  while (index < tag.length) {
    index = skipWhitespace(tag, index);
    const char = tag[index];

    if (char === ">") {
      break;
    }

    if (char === "/" && tag[index + 1] === ">") {
      selfClosing = true;
      break;
    }

    const attribute = readHtmlAttribute(tag, index);
    if (!attribute) {
      return null;
    }

    attributes.push(attribute.token);
    index = attribute.nextIndex;
  }

  return {
    tagName,
    attributes,
    selfClosing
  };
}

function readHtmlAttribute(
  tag: string,
  startIndex: number
): { token: HtmlAttributeToken; nextIndex: number } | null {
  const nameMatch = tag.slice(startIndex).match(/^([^\s=/>]+)/);
  if (!nameMatch) {
    return null;
  }

  const name = nameMatch[1];
  let index = startIndex + name.length;
  index = skipWhitespace(tag, index);

  if (tag[index] !== "=") {
    return {
      token: { name },
      nextIndex: index
    };
  }

  index += 1;
  index = skipWhitespace(tag, index);
  const value = readHtmlAttributeValue(tag, index);
  if (!value) {
    return null;
  }

  return {
    token: {
      name,
      value: value.value
    },
    nextIndex: value.nextIndex
  };
}

function readHtmlAttributeValue(
  tag: string,
  startIndex: number
): { value: string; nextIndex: number } | null {
  const quote = tag[startIndex];

  if (quote === "\"" || quote === "'") {
    let index = startIndex + 1;

    while (index < tag.length) {
      if (tag[index] === quote) {
        return {
          value: tag.slice(startIndex, index + 1),
          nextIndex: index + 1
        };
      }

      index += 1;
    }

    return null;
  }

  const valueMatch = tag.slice(startIndex).match(/^([^\s>]+)/);
  if (!valueMatch) {
    return null;
  }

  return {
    value: valueMatch[1],
    nextIndex: startIndex + valueMatch[1].length
  };
}

function findHtmlTagEnd(line: string, startIndex: number): number {
  let quote: "\"" | "'" | null = null;
  let twigDelimiter: "}}" | "%}" | "#}" | null = null;

  for (let index = startIndex; index < line.length; index += 1) {
    const twoChars = line.slice(index, index + 2);

    if (twigDelimiter) {
      if (twoChars === twigDelimiter) {
        twigDelimiter = null;
        index += 1;
      }
      continue;
    }

    if (quote) {
      if (twoChars === "{{") {
        twigDelimiter = "}}";
        index += 1;
        continue;
      }

      if (twoChars === "{%") {
        twigDelimiter = "%}";
        index += 1;
        continue;
      }

      if (twoChars === "{#") {
        twigDelimiter = "#}";
        index += 1;
        continue;
      }

      if (line[index] === quote) {
        quote = null;
      }
      continue;
    }

    if (line[index] === "\"" || line[index] === "'") {
      quote = line[index] as "\"" | "'";
      continue;
    }

    if (line[index] === ">") {
      return index;
    }
  }

  return -1;
}

function skipWhitespace(value: string, index: number): number {
  let nextIndex = index;

  while (/\s/.test(value[nextIndex] ?? "")) {
    nextIndex += 1;
  }

  return nextIndex;
}

function getNextEmbeddedBlockTag(line: string): "script" | "style" | null {
  if (/<script\b[^>]*>/i.test(line) && !/<\/script>/i.test(line)) {
    return "script";
  }

  if (/<style\b[^>]*>/i.test(line) && !/<\/style>/i.test(line)) {
    return "style";
  }

  return null;
}

function isEmbeddedClosingLine(line: string, tagName: "script" | "style"): boolean {
  return new RegExp(`</${tagName}>`, "i").test(line);
}
