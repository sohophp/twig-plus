import { parseHybridDocument, type HybridDocument, type NodePair } from "./hybridAst";
import type { SourceRange } from "./selectionRanges";

/** Expand a requested formatting range to complete lossless Twig/HTML structures. */
export function expandHybridFormattingRange(source: string, requested: SourceRange): SourceRange | null {
  if (requested.start < 0 || requested.end > source.length || requested.start >= requested.end) return null;
  const document = parseHybridDocument(source);
  let start = lineStart(source, requested.start);
  let end = lineEnd(source, requested.end);
  const unsafe = document.children.some((node) => node.kind === "ErrorNode" ||
    (node.kind === "IncompleteNode" && intersects(node, { start, end })));
  if (unsafe) return null;
  if (document.children.some((node) => node.kind === "HtmlOpenTag" && (node.tagName === "script" || node.tagName === "style") &&
    intersects(node, { start, end }) && !document.htmlElements.some((pair) => pair.openStart === node.start))) return null;
  for (const node of document.children) {
    if (!intersects(node, { start, end })) continue;
    if (node.kind === "TwigTag" || node.kind === "TwigOutput" || node.kind === "TwigComment") {
      if (!node.complete) return null;
      start = Math.min(start, node.start); end = Math.max(end, node.end);
    }
  }
  const pairs = [...document.htmlElements, ...document.twigControlBlocks];
  let changed = true;
  while (changed) {
    changed = false;
    for (const pair of pairs) {
      const range = { start, end };
      if (!intersects(pair, range) || contains(range, pair)) continue;
      const embedded = pair.kind === "HtmlElement" && (pair.name === "script" || pair.name === "style");
      if (contains(pair, range) && !embedded) continue;
      start = Math.min(start, pair.start); end = Math.max(end, pair.end); changed = true;
    }
  }
  start = lineStart(source, start); end = lineEnd(source, end);
  return isSafeEmbeddedBoundary(document, { start, end }) ? { start, end } : null;
}

function isSafeEmbeddedBoundary(document: HybridDocument, range: SourceRange): boolean {
  return document.htmlElements.filter((pair) => pair.name === "script" || pair.name === "style")
    .every((pair) => !intersects(pair, range) || contains(range, pair));
}
function intersects(left: SourceRange, right: SourceRange): boolean { return left.start < right.end && right.start < left.end; }
function contains(outer: SourceRange, inner: NodePair | SourceRange): boolean { return outer.start <= inner.start && outer.end >= inner.end; }
function lineStart(source: string, offset: number): number { return Math.max(0, source.lastIndexOf("\n", Math.max(0, offset - 1)) + 1); }
function lineEnd(source: string, offset: number): number { const end = source.indexOf("\n", Math.max(0, offset - 1)); return end < 0 ? source.length : end + 1; }
