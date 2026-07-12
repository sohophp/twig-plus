import { parseHybridDocument, type SourceRange } from "@twig-plus/parser";

export function getLinkedHtmlTagRanges(source: string, offset: number): [SourceRange, SourceRange] | null {
  const document = parseHybridDocument(source);
  for (const pair of document.htmlElements) {
    const opening = document.children.find((node) => node.kind === "HtmlOpenTag" && node.start === pair.openStart);
    const closing = document.children.find((node) => node.kind === "HtmlCloseTag" && node.start === pair.closeStart);
    if (!opening || !closing || !("tagNameRange" in opening) || !("tagNameRange" in closing)) continue;
    if ((offset >= opening.tagNameRange.start && offset <= opening.tagNameRange.end) ||
      (offset >= closing.tagNameRange.start && offset <= closing.tagNameRange.end)) {
      return [opening.tagNameRange, closing.tagNameRange];
    }
  }
  return null;
}
