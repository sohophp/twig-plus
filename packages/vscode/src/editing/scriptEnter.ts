import { getHtmlContextAtOffset, parseHybridDocument } from "@twig-plus/parser";
import type { OffsetSelection, TwigEnterOptions, TwigEnterResult } from "./twigEnter";

export function computeScriptEnterEdit(
  source: string,
  selections: OffsetSelection[],
  options: TwigEnterOptions
): TwigEnterResult | null {
  if (selections.length === 0 || selections.some((selection) => selection.anchor !== selection.active)) return null;
  const document = parseHybridDocument(source);
  const candidates = selections.map((selection) => {
    const offset = selection.active;
    if (getHtmlContextAtOffset(document, Math.max(0, offset - 1)).kind !== "script") return null;
    const lineStart = Math.max(0, source.lastIndexOf("\n", Math.max(0, offset - 1)) + 1);
    const lineEndAt = source.indexOf("\n", offset);
    const lineEnd = lineEndAt < 0 ? source.length : lineEndAt;
    if (!source.slice(lineStart, offset).trimEnd().endsWith("{")) return null;
    const suffix = source.slice(offset, lineEnd);
    if (!/^\s*\)*\s*;?\s*$/.test(suffix) || /^\s*}/.test(suffix)) return null;
    const baseIndent = source.slice(lineStart, offset).match(/^[\t ]*/)?.[0] ?? "";
    const innerIndent = baseIndent + options.indentUnit;
    return {
      offset,
      newText: `${options.eol}${innerIndent}${options.eol}${baseIndent}}`,
      cursorDelta: options.eol.length + innerIndent.length
    };
  });
  if (candidates.some((candidate) => candidate === null)) return null;
  const resolved = candidates.filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);
  const edits = resolved.map((candidate) => ({ start: candidate.offset, end: candidate.offset, newText: candidate.newText }));
  return {
    edits,
    selections: resolved.map((candidate) => {
      const priorDelta = edits.filter((edit) => edit.start < candidate.offset)
        .reduce((total, edit) => total + edit.newText.length, 0);
      const active = candidate.offset + priorDelta + candidate.cursorDelta;
      return { anchor: active, active };
    })
  };
}
