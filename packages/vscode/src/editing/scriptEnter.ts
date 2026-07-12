import { getHtmlContextAtOffset, parseHybridDocument } from "@twig-plus/parser";
import type { OffsetSelection, TwigEnterOptions, TwigEnterResult } from "./twigEnter";

export function computeScriptBracePairEdit(source: string, selections: OffsetSelection[]): TwigEnterResult | null {
  if (selections.length === 0 || selections.some((selection) => selection.anchor !== selection.active)) return null;
  const document = parseHybridDocument(source);
  const candidates = selections.map((selection) => {
    const offset = selection.active;
    const script = document.htmlElements.find((element) =>
      element.name === "script" && offset >= element.openEnd && offset <= element.closeStart);
    if (!script) return null;
    const twig = document.children.find((node) =>
      (node.kind === "TwigTag" || node.kind === "TwigOutput" || node.kind === "TwigComment") &&
      offset >= node.start && offset <= node.end);
    if (twig || !isJavaScriptCode(source.slice(script.openEnd, offset))) return null;
    return { offset, newText: "{}", cursorDelta: 1 };
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

export function computeScriptBracePairDelete(source: string, selections: OffsetSelection[]): TwigEnterResult | null {
  if (selections.length === 0 || selections.some((selection) => selection.anchor !== selection.active)) return null;
  const document = parseHybridDocument(source);
  const candidates = selections.map((selection) => {
    const offset = selection.active;
    if (offset === 0 || source[offset - 1] !== "{" || source[offset] !== "}") return null;
    const script = document.htmlElements.find((element) =>
      element.name === "script" && offset > element.openEnd && offset < element.closeStart);
    if (!script || !isJavaScriptCode(source.slice(script.openEnd, offset - 1))) return null;
    const twig = document.children.find((node) =>
      (node.kind === "TwigTag" || node.kind === "TwigOutput" || node.kind === "TwigComment") &&
      offset - 1 >= node.start && offset <= node.end);
    if (twig) return null;
    return { start: offset - 1, end: offset + 1, active: offset - 1 };
  });
  if (candidates.some((candidate) => candidate === null)) return null;
  const resolved = candidates.filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);
  const edits = resolved.map((candidate) => ({ start: candidate.start, end: candidate.end, newText: "" }));
  return {
    edits,
    selections: resolved.map((candidate) => {
      const priorDelta = edits.filter((edit) => edit.start < candidate.start)
        .reduce((total, edit) => total + edit.newText.length - (edit.end - edit.start), 0);
      const active = candidate.active + priorDelta;
      return { anchor: active, active };
    })
  };
}

function isJavaScriptCode(source: string): boolean {
  let state: "code" | "single" | "double" | "template" | "line-comment" | "block-comment" = "code";
  for (let index = 0; index < source.length; index += 1) {
    const current = source[index];
    const next = source[index + 1];
    if (state === "code") {
      if (current === "'") state = "single";
      else if (current === "\"") state = "double";
      else if (current === "`") state = "template";
      else if (current === "/" && next === "/") { state = "line-comment"; index += 1; }
      else if (current === "/" && next === "*") { state = "block-comment"; index += 1; }
    } else if (state === "line-comment") {
      if (current === "\n") state = "code";
    } else if (state === "block-comment") {
      if (current === "*" && next === "/") { state = "code"; index += 1; }
    } else if (current === "\\") {
      index += 1;
    } else if ((state === "single" && current === "'") ||
      (state === "double" && current === "\"") || (state === "template" && current === "`")) {
      state = "code";
    }
  }
  return state === "code";
}

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
