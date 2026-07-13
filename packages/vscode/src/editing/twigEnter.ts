import { getHtmlContextAtOffset, parseHybridDocument, type TwigNode } from "@twig-plus/parser";

export interface OffsetSelection { anchor: number; active: number; }
export interface TwigEnterOptions { eol: "\n" | "\r\n"; indentUnit: string; }
export interface TwigEnterEdit { start: number; end: number; newText: string; }
export interface TwigEnterResult { edits: TwigEnterEdit[]; selections: OffsetSelection[]; }

const CLOSING_TAGS: Record<string, string> = {
  block: "endblock", if: "endif", for: "endfor", embed: "endembed", macro: "endmacro",
  apply: "endapply", autoescape: "endautoescape", with: "endwith", set: "endset",
  cache: "endcache", guard: "endguard", sandbox: "endsandbox", types: "endtypes", verbatim: "endverbatim"
};

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
  if (!node || !node.tagName || !CLOSING_TAGS[node.tagName]) return null;
  if (getHtmlContextAtOffset(document, node.start).kind === "script" || getHtmlContextAtOffset(document, node.start).kind === "style") return null;
  if (document.twigControlBlocks.some((pair) => pair.openStart === node.start)) return null;
  const baseIndent = source.slice(lineStart, node.start).match(/^[\t ]*/)?.[0] ?? "";
  const innerIndent = baseIndent + options.indentUnit;
  const newText = `${options.eol}${innerIndent}${options.eol}${baseIndent}{% ${CLOSING_TAGS[node.tagName]} %}`;
  return { offset, tagName: node.tagName, newText, cursorDelta: options.eol.length + innerIndent.length };
}
