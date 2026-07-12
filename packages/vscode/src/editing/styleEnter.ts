import { getHtmlContextAtOffset, parseHybridDocument } from "@twig-plus/parser";
import type { OffsetSelection, TwigEnterOptions, TwigEnterResult } from "./twigEnter";

export function computeStyleEnterEdit(
  source: string,
  selections: OffsetSelection[],
  options: TwigEnterOptions
): TwigEnterResult | null {
  if (selections.length === 0 || selections.some((selection) => selection.anchor !== selection.active)) return null;
  const document = parseHybridDocument(source);
  const candidates = selections.map((selection) => {
    const offset = selection.active;
    if (getHtmlContextAtOffset(document, Math.max(0, offset - 1)).kind !== "style") return null;
    const style = document.htmlElements.find((element) =>
      element.name === "style" && offset >= element.openEnd && offset <= element.closeStart);
    if (!style) return null;
    const lineStart = Math.max(0, source.lastIndexOf("\n", Math.max(0, offset - 1)) + 1);
    const lineEndAt = source.indexOf("\n", offset);
    const lineEnd = lineEndAt < 0 ? source.length : lineEndAt;
    const before = source.slice(lineStart, offset).trimEnd();
    if (!before.endsWith("{") || source.slice(offset, lineEnd).trim() !== "") return null;
    const openingBrace = lineStart + before.lastIndexOf("{");
    if (hasMatchingCssBrace(source, openingBrace, style.closeStart)) return null;
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

function hasMatchingCssBrace(source: string, openingOffset: number, end: number): boolean {
  let depth = 1;
  let state: "code" | "single" | "double" | "comment" = "code";
  for (let index = openingOffset + 1; index < end; index += 1) {
    const current = source[index];
    const next = source[index + 1];
    if (state === "code") {
      if (current === "'") state = "single";
      else if (current === "\"") state = "double";
      else if (current === "/" && next === "*") { state = "comment"; index += 1; }
      else if (current === "{") depth += 1;
      else if (current === "}" && --depth === 0) return true;
    } else if (state === "comment") {
      if (current === "*" && next === "/") { state = "code"; index += 1; }
    } else if (current === "\\") {
      index += 1;
    } else if ((state === "single" && current === "'") || (state === "double" && current === "\"")) {
      state = "code";
    }
  }
  return false;
}
