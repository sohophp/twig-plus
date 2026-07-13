import type { HybridDocument, HtmlTagNode, TwigNode } from "./hybridAst";
import type { SourceRange } from "./selectionRanges";

export type EmbeddedScriptKind = "javascript" | "javascript-module";

export interface EmbeddedScriptDocument {
  kind: EmbeddedScriptKind;
  sourceRange: SourceRange;
  generatedSource: string;
  toGeneratedOffset(originalOffset: number): number | null;
  toOriginalRange(generatedStart: number, generatedEnd: number): SourceRange | null;
}

/** Builds JavaScript snapshots from parsed script bodies without reparsing the Twig/HTML structure. */
export function createEmbeddedScriptDocuments(document: HybridDocument): EmbeddedScriptDocument[] {
  return document.children.flatMap((node) => {
    if (node.kind !== "HtmlOpenTag" || node.tagName !== "script" || node.selfClosing) return [];
    const open = node;
    const kind = getScriptKind(document.source, open);
    if (!kind) return [];
    const element = document.htmlElements.find((candidate) =>
      candidate.name === "script" && candidate.openStart === open.start);
    const sourceRange = { start: open.end, end: element?.closeStart ?? document.end };
    return [createDocument(document, kind, sourceRange)];
  });
}

function getScriptKind(source: string, open: HtmlTagNode): EmbeddedScriptKind | null {
  const type = open.attributes.find((attribute) => attribute.name.toLowerCase() === "type");
  if (!type?.valueContentRange) return "javascript";
  const value = source.slice(type.valueContentRange.start, type.valueContentRange.end).trim().toLowerCase();
  if (value === "module") return "javascript-module";
  if (value === "text/javascript" || value === "application/javascript") return "javascript";
  return null;
}

function createDocument(
  document: HybridDocument,
  kind: EmbeddedScriptKind,
  sourceRange: SourceRange
): EmbeddedScriptDocument {
  const characters = [...document.source.slice(sourceRange.start, sourceRange.end)];
  const generatedRanges: SourceRange[] = [];
  const twigNodes = document.children.filter((node): node is TwigNode =>
    isTwigNode(node) && node.start < sourceRange.end && node.end > sourceRange.start);

  for (const node of twigNodes) {
    const start = Math.max(node.start, sourceRange.start) - sourceRange.start;
    const end = Math.min(node.end, sourceRange.end) - sourceRange.start;
    generatedRanges.push({ start, end });
    const replacement = node.kind === "TwigOutput" ? paddedExpression(end - start) : paddedWhitespace(characters, start, end);
    for (let index = start; index < end; index += 1) characters[index] = replacement[index - start];
  }

  const overlapsGenerated = (start: number, end: number) => generatedRanges.some((range) =>
    start === end ? start >= range.start && start < range.end : start < range.end && end > range.start);

  return {
    kind,
    sourceRange,
    generatedSource: characters.join(""),
    toGeneratedOffset(originalOffset) {
      if (originalOffset < sourceRange.start || originalOffset > sourceRange.end) return null;
      const generated = originalOffset - sourceRange.start;
      return generatedRanges.some((range) => generated >= range.start && generated < range.end) ? null : generated;
    },
    toOriginalRange(generatedStart, generatedEnd) {
      if (generatedStart < 0 || generatedEnd < generatedStart || generatedEnd > characters.length) return null;
      if (overlapsGenerated(generatedStart, generatedEnd)) return null;
      return { start: sourceRange.start + generatedStart, end: sourceRange.start + generatedEnd };
    }
  };
}

function isTwigNode(node: HybridDocument["children"][number]): node is TwigNode {
  return node.kind === "TwigOutput" || node.kind === "TwigTag" || node.kind === "TwigComment" ||
    (node.kind === "IncompleteNode" && "inner" in node);
}

function paddedExpression(length: number): string[] {
  const expression = length >= "undefined".length ? "undefined" : "0";
  return [...expression.padEnd(length, " ")];
}

function paddedWhitespace(characters: string[], start: number, end: number): string[] {
  return characters.slice(start, end).map((character) => character === "\n" || character === "\r" ? character : " ");
}
