import { parseHybridDocument } from "@twig-plus/parser";
import type { OffsetSelection, TwigEnterEdit, TwigEnterOptions, TwigEnterResult } from "./twigEnter";

export interface HtmlTagCloseResult { edits: TwigEnterEdit[]; selections: OffsetSelection[]; }

const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
  "param", "source", "track", "wbr"
]);

export function computeHtmlTagCloseEdit(source: string, selections: OffsetSelection[]): HtmlTagCloseResult | null {
  if (selections.length === 0 || selections.some((selection) => selection.anchor !== selection.active)) return null;
  const document = parseHybridDocument(source);
  const candidates = selections.map((selection) => candidateAt(source, selection.active, document));
  if (candidates.some((candidate) => candidate === null)) return null;
  const resolved = candidates.filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);
  const edits = resolved.map((candidate) => ({ start: candidate.offset, end: candidate.offset, newText: candidate.text }));
  return {
    edits,
    selections: resolved.map((candidate) => {
      const priorDelta = edits.filter((edit) => edit.start < candidate.offset)
        .reduce((total, edit) => total + edit.newText.length, 0);
      const active = candidate.offset + priorDelta + 1;
      return { anchor: active, active };
    })
  };
}

export function computeHtmlEnterEdit(
  source: string,
  selections: OffsetSelection[],
  options: TwigEnterOptions
): TwigEnterResult | null {
  if (selections.length === 0 || selections.some((selection) => selection.anchor !== selection.active)) return null;
  const candidates = selections.map((selection) => htmlEnterCandidate(source, selection.active, options));
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

function htmlEnterCandidate(
  source: string,
  offset: number,
  options: TwigEnterOptions
): { offset: number; newText: string; cursorDelta: number } | null {
  const lineStart = Math.max(0, source.lastIndexOf("\n", Math.max(0, offset - 1)) + 1);
  const nextNewline = source.indexOf("\n", offset);
  const lineEnd = nextNewline < 0 ? source.length : nextNewline;
  if (source.slice(offset, lineEnd).trim() !== "") return null;
  const before = source.slice(lineStart, offset);
  const match = before.match(/^(\s*)<([A-Za-z][\w:-]*)(?:\s[^<>]*)?>\s*$/);
  if (!match || before.trimEnd().endsWith("/>") || VOID_ELEMENTS.has(match[2].toLowerCase())) return null;
  const tagName = match[2];
  if (source.slice(offset).toLowerCase().includes(`</${tagName.toLowerCase()}>`)) return null;
  const baseIndent = match[1];
  const innerIndent = baseIndent + options.indentUnit;
  const newText = `${options.eol}${innerIndent}${options.eol}${baseIndent}</${tagName}>`;
  return { offset, newText, cursorDelta: options.eol.length + innerIndent.length };
}

function candidateAt(
  source: string,
  offset: number,
  document: ReturnType<typeof parseHybridDocument>
): { offset: number; text: string } | null {
  const start = source.lastIndexOf("<", offset - 1);
  if (start < 0 || source.slice(start, offset).includes(">")) return null;
  const raw = source.slice(start, offset);
  const match = raw.match(/^<([A-Za-z][\w:-]*)(?:\s[\s\S]*)?$/);
  if (!match || raw.endsWith("/") || hasUnclosedQuote(raw)) return null;
  const tagName = match[1];
  if (VOID_ELEMENTS.has(tagName.toLowerCase())) return null;
  const containing = document.children.find((node) => node.start <= start && node.end >= offset);
  if (containing?.kind === "TwigTag" || containing?.kind === "TwigOutput" || containing?.kind === "TwigComment") return null;
  if (source.slice(offset).trimStart().toLowerCase().startsWith(`</${tagName.toLowerCase()}`)) return null;
  return { offset, text: `></${tagName}>` };
}

function hasUnclosedQuote(value: string): boolean {
  let quote: "\"" | "'" | null = null;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if ((character === "\"" || character === "'") && value[index - 1] !== "\\") {
      quote = quote === character ? null : quote ?? character;
    }
  }
  return quote !== null;
}
