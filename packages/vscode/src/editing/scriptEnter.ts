import { createEmbeddedScriptDocuments, getHtmlContextAtOffset, parseHybridDocument } from "@twig-plus/parser";
import type { OffsetSelection, TwigEnterOptions, TwigEnterResult } from "./twigEnter";

export function shouldInsertJavaScriptBracePair(source: string, offset: number): boolean {
  const script = createEmbeddedScriptDocuments(parseHybridDocument(source)).find((candidate) =>
    offset >= candidate.sourceRange.start && offset <= candidate.sourceRange.end);
  const generatedOffset = script?.toGeneratedOffset(offset);
  if (!script || generatedOffset === null || generatedOffset === undefined) return false;
  const before = script.generatedSource.slice(0, generatedOffset);
  if (!isJavaScriptCode(before)) return false;
  const lineStart = Math.max(0, before.lastIndexOf("\n") + 1);
  return /(?:=>|[)=]|\b(?:else|try|finally|do))$/.test(before.slice(lineStart).trimEnd());
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
    const hasNativeClosingBrace = /^\s*}/.test(suffix);
    if (!hasNativeClosingBrace && !/^\s*\)*\s*;?\s*$/.test(suffix)) return null;
    const baseIndent = source.slice(lineStart, offset).match(/^[\t ]*/)?.[0] ?? "";
    const innerIndent = baseIndent + options.indentUnit;
    return {
      offset,
      newText: `${options.eol}${innerIndent}${options.eol}${baseIndent}${hasNativeClosingBrace ? "" : "}"}`,
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

function isJavaScriptCode(source: string): boolean {
  let state: "code" | "single" | "double" | "template" | "line-comment" | "block-comment" | "regex" = "code";
  let inRegexClass = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (state === "line-comment") { if (character === "\n" || character === "\r") state = "code"; continue; }
    if (state === "block-comment") { if (character === "*" && next === "/") { state = "code"; index += 1; } continue; }
    if (state === "single" || state === "double" || state === "template") {
      if (character === "\\") { index += 1; continue; }
      if ((state === "single" && character === "'") || (state === "double" && character === '"') || (state === "template" && character === "`")) state = "code";
      continue;
    }
    if (state === "regex") {
      if (character === "\\") { index += 1; continue; }
      if (character === "[") inRegexClass = true;
      else if (character === "]") inRegexClass = false;
      else if (character === "/" && !inRegexClass) state = "code";
      continue;
    }
    if (character === "/" && next === "/") { state = "line-comment"; index += 1; continue; }
    if (character === "/" && next === "*") { state = "block-comment"; index += 1; continue; }
    if (character === "'") { state = "single"; continue; }
    if (character === '"') { state = "double"; continue; }
    if (character === "`") { state = "template"; continue; }
    if (character === "/" && startsRegexLiteral(source, index)) state = "regex";
  }
  return state === "code";
}

function startsRegexLiteral(source: string, slashOffset: number): boolean {
  const prefix = source.slice(0, slashOffset).trimEnd();
  return !prefix || /(?:^|[([{,:;=!?&|+*%~-]|\b(?:case|delete|in|instanceof|new|return|throw|typeof|void|yield))$/.test(prefix);
}
