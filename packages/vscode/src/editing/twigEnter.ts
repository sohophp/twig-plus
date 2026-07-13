import { getTwigTag, parseHybridDocument, type TwigNode } from "@twig-plus/parser";

export interface OffsetSelection { anchor: number; active: number; }
export interface TwigEnterOptions { eol: "\n" | "\r\n"; indentUnit: string; }
export interface TwigEnterEdit { start: number; end: number; newText: string; }
export interface TwigEnterResult { edits: TwigEnterEdit[]; selections: OffsetSelection[]; }

export function computeTwigEnterEdit(
  source: string,
  selections: OffsetSelection[],
  options: TwigEnterOptions
): TwigEnterResult | null {
  if (selections.length === 0 || selections.some((selection) => selection.anchor !== selection.active)) return null;
  const document = parseHybridDocument(source);
  const candidates = selections.map((selection) => candidateAt(document, source, selection.active, options));
  if (candidates.some((candidate) => candidate === null)) return null;
  const resolved = candidates.filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);
  if (new Set(resolved.map((candidate) => candidate.tagName)).size !== 1) return null;
  const edits = resolved.map((candidate) => ({ start: candidate.offset, end: candidate.offset, newText: candidate.newText }));
  const selectionsAfter = resolved.map((candidate) => {
    const priorDelta = edits.filter((edit) => edit.start < candidate.offset).reduce((total, edit) => total + edit.newText.length, 0);
    const active = candidate.offset + priorDelta + candidate.cursorDelta;
    return { anchor: active, active };
  });
  return { edits, selections: selectionsAfter };
}

function candidateAt(
  document: ReturnType<typeof parseHybridDocument>,
  source: string,
  offset: number,
  options: TwigEnterOptions
): { offset: number; tagName: string; newText: string; cursorDelta: number } | null {
  const lineStart = Math.max(0, source.lastIndexOf("\n", Math.max(0, offset - 1)) + 1);
  const nextNewline = source.indexOf("\n", offset);
  const lineEnd = nextNewline < 0 ? source.length : nextNewline;
  if (source.slice(offset, lineEnd).trim() !== "") return null;
  const node = document.children.find((item): item is TwigNode =>
    item.kind === "TwigTag" && item.complete && item.tagKind === "opening" && item.end <= offset &&
    source.slice(item.end, offset).trim() === "" && source.slice(lineStart, item.start).trim() === "");
  const closing = node?.tagName ? getTwigTag(node.tagName)?.closing : undefined;
  if (!node || !node.tagName || !closing) return null;
  if (isInEmbeddedLiteralOrComment(document, source, node.start)) return null;
  if (document.twigControlBlocks.some((pair) => pair.openStart === node.start)) return null;
  const baseIndent = source.slice(lineStart, node.start).match(/^[\t ]*/)?.[0] ?? "";
  const innerIndent = baseIndent + options.indentUnit;
  const newText = `${options.eol}${innerIndent}${options.eol}${baseIndent}{% ${closing} %}`;
  return { offset, tagName: node.tagName, newText, cursorDelta: options.eol.length + innerIndent.length };
}

function isInEmbeddedLiteralOrComment(
  document: ReturnType<typeof parseHybridDocument>, source: string, offset: number
): boolean {
  const pair = document.htmlElements.find((item) =>
    (item.name === "script" || item.name === "style") && offset >= item.openEnd && offset <= item.closeStart);
  if (!pair) return false;
  const script = pair.name === "script";
  const twigRanges = document.children.filter((item) =>
    (item.kind === "TwigTag" || item.kind === "TwigOutput" || item.kind === "TwigComment" || item.kind === "IncompleteNode") &&
    item.start >= pair.openEnd && item.end <= offset);
  let state: "code" | "single" | "double" | "template" | "line-comment" | "block-comment" = "code";
  for (let index = pair.openEnd; index < offset; index += 1) {
    const twig = twigRanges.find((item) => index >= item.start && index < item.end);
    if (twig) { index = twig.end - 1; continue; }
    const character = source[index];
    const next = source[index + 1];
    if (state === "line-comment") { if (character === "\n") state = "code"; continue; }
    if (state === "block-comment") { if (character === "*" && next === "/") { state = "code"; index += 1; } continue; }
    if (state !== "code") {
      if (character === "\\") { index += 1; continue; }
      if ((state === "single" && character === "'") || (state === "double" && character === '"') ||
        (state === "template" && character === "`")) state = "code";
      continue;
    }
    if (character === "/" && next === "*") { state = "block-comment"; index += 1; continue; }
    if (script && character === "/" && next === "/") { state = "line-comment"; index += 1; continue; }
    if (character === "'") state = "single";
    else if (character === '"') state = "double";
    else if (script && character === "`") state = "template";
  }
  return state !== "code";
}
