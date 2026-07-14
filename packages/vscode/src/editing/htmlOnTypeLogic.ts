import { collectHybridUnclosedTwigControlTags, parseHybridDocument, type HtmlTagNode } from "@twig-plus/parser";

export function computeHtmlOnTypeEdit(source: string, offset: number): { start: number; end: number; newText: string } | null {
  if (offset <= 0 || source[offset - 1] !== ">") return null;
  const document = parseHybridDocument(source);
  const opening = document.children.find((node): node is HtmlTagNode => node.kind === "HtmlOpenTag" && node.end === offset);
  if (!opening || opening.selfClosing || opening.tagNameRange.end <= opening.tagNameRange.start) return null;
  if (collectHybridUnclosedTwigControlTags(document, opening.start).includes("verbatim")) return null;
  if (document.htmlElements.some((pair) => pair.openStart === opening.start)) return null;
  return { start: offset, end: offset, newText: `</${opening.raw.slice(opening.tagNameRange.start - opening.start, opening.tagNameRange.end - opening.start)}>` };
}
