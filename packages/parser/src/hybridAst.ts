import { getTwigTagKind, getTwigTagName, type TwigTagKind } from "./twigStructure";
import type { SourceRange } from "./selectionRanges";
import type { TwigBlockSymbolData, TwigMacroImport, TwigMacroReference, TwigStructureSymbolKind } from "./blockAnalysis";
import { parseTwigExpression, parseTwigStatement, visitTwigExpression, type TwigExpression, type TwigStatement } from "./twigAst";
import { lexTwig } from "./twigTokenizer";
import type { TwigTokenContext } from "./twigTokenContext";

interface HybridNodeBase extends SourceRange {
  raw: string;
}

export interface TextNode extends HybridNodeBase {
  kind: "Text";
}

export interface TwigNode extends HybridNodeBase {
  kind: "TwigTag" | "TwigOutput" | "TwigComment" | "IncompleteNode";
  inner: string;
  complete: boolean;
  tagName?: string | null;
  tagKind?: TwigTagKind;
  /** Semantic syntax associated with this lossless CST node. */
  expression?: TwigExpression;
  statement?: TwigStatement;
}

export interface HtmlAttribute extends HybridNodeBase {
  kind: "HtmlAttribute";
  name: string;
  nameRange: SourceRange;
  valueRange?: SourceRange;
  valueContentRange?: SourceRange;
  quote: "'" | '"' | null;
  incomplete: boolean;
}

export interface HtmlTwigAttributeSegment extends SourceRange {
  kind: "TwigAttributeSegment";
  node: TwigNode;
}

export type HtmlAttributeSegment = HtmlAttribute | HtmlTwigAttributeSegment;

export interface HtmlTagNode extends HybridNodeBase {
  kind: "HtmlOpenTag" | "HtmlCloseTag" | "IncompleteNode";
  tagName: string | null;
  complete: boolean;
  selfClosing: boolean;
  attributes: HtmlAttribute[];
  attributeSegments: HtmlAttributeSegment[];
  embeddedTwig: TwigNode[];
  tagNameRange: SourceRange;
}

export interface ErrorNode extends HybridNodeBase {
  kind: "ErrorNode";
  message: string;
}

export type HybridNode = TextNode | TwigNode | HtmlTagNode | ErrorNode;

export interface NodePair extends SourceRange {
  kind: "HtmlElement" | "TwigControlBlock";
  name: string;
  openStart: number;
  openEnd: number;
  closeStart: number;
  closeEnd: number;
}

export interface HybridBranch extends SourceRange {
  kind: "TwigBranch";
  name: string;
  markerStart: number;
  markerEnd: number;
}

export interface HybridStructureNode extends SourceRange {
  kind: "HtmlElement" | "TwigControlBlock";
  name: string;
  openStart: number;
  openEnd: number;
  closeStart: number;
  closeEnd: number;
  branches: HybridBranch[];
  children: HybridStructureNode[];
}

export interface HybridDocument extends SourceRange {
  kind: "HybridDocument";
  source: string;
  children: HybridNode[];
  htmlElements: NodePair[];
  twigControlBlocks: NodePair[];
  /** Best-effort containment forest. Crossing HTML/Twig ranges remain separate roots. */
  structure: HybridStructureNode[];
  errors: ErrorNode[];
}

export interface HtmlCompletionContext {
  kind: "tag-name" | "attribute-name" | "attribute-value" | "script" | "style" | "html-text";
  tagName: string | null;
  tagRange?: SourceRange;
  attribute?: HtmlAttribute;
}

const VOID_HTML_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
  "meta", "param", "source", "track", "wbr"
]);

const TWIG_CLOSERS: Record<string, string> = {
  endif: "if", endfor: "for", endblock: "block", endembed: "embed",
  endmacro: "macro", endapply: "apply", endfilter: "filter",
  endautoescape: "autoescape", endwith: "with", endspaceless: "spaceless",
  endset: "set",
  endcache: "cache", endguard: "guard", endsandbox: "sandbox", endtypes: "types", endverbatim: "verbatim"
};

export function parseHybridDocument(source: string): HybridDocument {
  const children: HybridNode[] = [];
  let offset = 0;
  let rawTextTag: "script" | "style" | null = null;

  while (offset < source.length) {
    const twig = scanTwigNode(source, offset);
    if (twig) {
      children.push(twig);
      offset = twig.end;
      continue;
    }

    if (rawTextTag && !startsRawTextClose(source, offset, rawTextTag)) {
      const next = findNextRawTextConstruct(source, offset + 1, rawTextTag);
      const end = next === -1 ? source.length : next;
      children.push({ kind: "Text", raw: source.slice(offset, end), start: offset, end });
      offset = end;
      continue;
    }

    const html = scanHtmlTag(source, offset);
    if (html) {
      children.push(html);
      offset = html.end;
      if (html.kind === "HtmlOpenTag" && !html.selfClosing && (html.tagName === "script" || html.tagName === "style")) {
        rawTextTag = html.tagName;
      } else if (html.kind === "HtmlCloseTag" && html.tagName === rawTextTag) {
        rawTextTag = null;
      }
      continue;
    }

    const next = findNextConstruct(source, offset + 1);
    const end = next === -1 ? source.length : next;
    children.push({ kind: "Text", raw: source.slice(offset, end), start: offset, end });
    offset = end;
  }

  const htmlElements = pairHtmlElements(children);
  const twigControlBlocks = pairTwigBlocks(children);
  const structure = buildStructureForest(children, [...htmlElements, ...twigControlBlocks]);
  const errors = children.filter((node): node is ErrorNode => node.kind === "ErrorNode");

  return {
    kind: "HybridDocument",
    source,
    start: 0,
    end: source.length,
    children,
    htmlElements,
    twigControlBlocks,
    structure,
    errors
  };
}

function buildStructureForest(children: HybridNode[], pairs: NodePair[]): HybridStructureNode[] {
  const nodes: HybridStructureNode[] = pairs.map((pair) => ({ ...pair, branches: collectPairBranches(children, pair), children: [] }));
  const roots: HybridStructureNode[] = [];
  for (const node of nodes.sort((left, right) => left.start - right.start || right.end - left.end)) {
    const parent = nodes
      .filter((candidate) => candidate !== node && candidate.start <= node.start && candidate.end >= node.end && (candidate.start < node.start || candidate.end > node.end))
      .sort((left, right) => (left.end - left.start) - (right.end - right.start))[0];
    if (parent && !crosses(node, parent)) parent.children.push(node);
    else roots.push(node);
  }
  const sort = (items: HybridStructureNode[]) => {
    items.sort((left, right) => left.start - right.start);
    items.forEach((item) => sort(item.children));
  };
  sort(roots);
  return roots;
}

function collectPairBranches(children: HybridNode[], pair: NodePair): HybridBranch[] {
  if (pair.kind !== "TwigControlBlock") return [];
  const markers: TwigNode[] = [];
  const nested: string[] = [];
  for (const node of children) {
    if (node.start < pair.openEnd || node.end > pair.closeStart || node.kind !== "TwigTag" || !node.tagName || !node.tagKind) continue;
    if (node.tagKind === "opening") nested.push(node.tagName);
    else if (node.tagKind === "closing") {
      const opening = TWIG_CLOSERS[node.tagName];
      const index = findLastIndex(nested, (name) => name === opening);
      if (index >= 0) nested.splice(index, 1);
    } else if (node.tagKind === "middle" && nested.length === 0 && supportsMiddle(pair.name, node.tagName)) markers.push(node);
  }
  return markers.map((node, index) => ({
    kind: "TwigBranch", name: node.tagName ?? "branch", start: node.end,
    end: markers[index + 1]?.start ?? pair.closeStart, markerStart: node.start, markerEnd: node.end
  }));
}

function crosses(node: SourceRange, parent: SourceRange): boolean {
  return node.start < parent.start || node.end > parent.end;
}

function startsRawTextClose(source: string, offset: number, tagName: string): boolean {
  return new RegExp(`^<\\s*\\/\\s*${tagName}\\b`, "i").test(source.slice(offset));
}

function findNextRawTextConstruct(source: string, start: number, tagName: string): number {
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === "{" && /[{%#]/.test(source[index + 1] ?? "")) return index;
    if (source[index] === "<" && startsRawTextClose(source, index, tagName)) return index;
  }
  return -1;
}

export function reconstructHybridDocument(document: HybridDocument): string {
  return document.children.map((node) => node.raw).join("");
}

export function createHtmlVirtualSource(document: HybridDocument): string {
  const characters = [...document.source];
  const mask = (start: number, end: number) => {
    for (let index = start; index < end; index += 1) {
      if (characters[index] !== "\n" && characters[index] !== "\r") characters[index] = " ";
    }
  };
  for (const node of document.children) {
    if (node.kind === "TwigTag" || node.kind === "TwigOutput" || node.kind === "TwigComment" || (node.kind === "IncompleteNode" && "inner" in node)) mask(node.start, node.end);
    if ("embeddedTwig" in node) for (const twig of node.embeddedTwig) mask(twig.start, twig.end);
  }
  return characters.join("");
}

export function collectHybridStructureSymbols(document: HybridDocument): TwigBlockSymbolData[] {
  const stack: TwigBlockSymbolData[] = [];
  const symbols: TwigBlockSymbolData[] = [];
  for (const node of document.children) {
    if (node.kind !== "TwigTag" || !node.tagName || !node.tagKind) continue;
    const content = node.inner.trim().replace(/^[-~]\s*/, "").replace(/\s*[-~]$/, "");
    if (node.tagKind === "opening") {
      const kind = getStructureKind(content, node.tagName);
      const name = kind ? content.match(new RegExp(`^${node.tagName}\\s+([A-Za-z_][A-Za-z0-9_]*)`))?.[1] : undefined;
      if (!kind || !name) continue;
      const nameStart = node.start + 2 + content.indexOf(name);
      stack.push({ kind, name, start: node.start, end: node.end, nameStart, nameEnd: nameStart + name.length, bodyStart: node.end });
    } else if (node.tagKind === "closing") {
      const kind = getClosingStructureKind(node.tagName);
      const index = kind ? findLastIndex(stack, (symbol) => symbol.kind === kind) : -1;
      if (index >= 0) {
        const open = stack.splice(index, 1)[0];
        symbols.push({ ...open, end: node.end });
      }
    }
  }
  return symbols.sort((left, right) => left.start - right.start);
}

export function collectHybridBlockSymbols(document: HybridDocument): TwigBlockSymbolData[] {
  return collectHybridStructureSymbols(document).filter((symbol) => symbol.kind === "block");
}

export function getHybridBlockReferenceAtOffset(document: HybridDocument, offset: number): TwigBlockSymbolData | null {
  return collectHybridStructureSymbols(document).find((symbol) => offset >= symbol.nameStart && offset <= symbol.nameEnd) ?? null;
}

export function collectHybridMacroImports(document: HybridDocument): TwigMacroImport[] {
  const imports: TwigMacroImport[] = [];
  for (const node of document.children) {
    if (node.kind !== "TwigTag") continue;
    const content = node.inner.trim().replace(/^[-~]\s*/, "").replace(/\s*[-~]$/, "");
    const importMatch = content.match(/^import\s+['"]([^'"]+)['"]\s+as\s+([A-Za-z_][A-Za-z0-9_]*)/i);
    if (importMatch) {
      imports.push({ kind: "import", template: importMatch[1], exportedName: "*", localName: importMatch[2], alias: importMatch[2] });
      continue;
    }
    const fromMatch = content.match(/^from\s+['"]([^'"]+)['"]\s+import\s+([\s\S]+)$/i);
    if (!fromMatch) continue;
    for (const specifier of fromMatch[2].split(",")) {
      const match = specifier.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?$/);
      if (!match) continue;
      imports.push({ kind: "from", template: fromMatch[1], exportedName: match[1], localName: match[2] ?? match[1], alias: null });
    }
  }
  return imports;
}

export function getHybridMacroReferenceAtOffset(document: HybridDocument, offset: number): TwigMacroReference | null {
  const node = document.children.find((candidate) =>
    candidate.kind !== "TwigComment" && offset >= candidate.start && offset <= candidate.end);
  if (!node || !(node.kind === "TwigTag" || node.kind === "TwigOutput")) return null;
  for (const match of node.raw.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)) {
    const alias = match[1];
    const name = match[2];
    const start = node.start + (match.index ?? 0);
    if (offset >= start && offset <= start + alias.length + 1 + name.length) return { alias, kind: alias === "_self" ? "self" : "import", name };
  }
  for (const match of node.raw.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)) {
    const name = match[1];
    const relativeStart = match.index ?? 0;
    const start = node.start + relativeStart;
    if (node.raw[relativeStart - 1] !== "." && offset >= start && offset <= start + name.length) return { alias: null, kind: "from", name };
  }
  return null;
}

export function getHybridExtendsTemplateReference(document: HybridDocument): string | null {
  for (const node of document.children) {
    if (node.kind !== "TwigTag") continue;
    const content = node.inner.trim().replace(/^[-~]\s*/, "").replace(/\s*[-~]$/, "");
    const match = content.match(/^extends\s+['"]([^'"]+)['"]/i);
    if (match) return match[1];
  }
  return null;
}

function getStructureKind(content: string, tagName: string): TwigStructureSymbolKind | null {
  if (tagName === "block" || tagName === "macro") return tagName;
  if (tagName === "set" && !content.includes("=")) return "set";
  return null;
}

function getClosingStructureKind(tagName: string): TwigStructureSymbolKind | null {
  if (tagName === "endblock") return "block";
  if (tagName === "endmacro") return "macro";
  if (tagName === "endset") return "set";
  return null;
}

export function getHtmlContextAtOffset(document: HybridDocument, offset: number): HtmlCompletionContext {
  for (const pair of document.htmlElements) {
    if (offset >= pair.openEnd && offset <= pair.closeStart && (pair.name === "script" || pair.name === "style")) {
      return { kind: pair.name, tagName: pair.name };
    }
  }
  const tag = document.children.find((node): node is HtmlTagNode =>
    "attributes" in node && offset >= node.start && offset <= node.end);
  if (tag) {
    const attribute = tag.attributes?.find((item) => offset >= item.start && offset <= item.end);
    if (attribute?.valueRange && offset >= attribute.valueRange.start && offset <= attribute.valueRange.end) {
      return { kind: "attribute-value", tagName: tag.tagName, tagRange: tag, attribute };
    }
    if (attribute) return { kind: "attribute-name", tagName: tag.tagName, tagRange: tag, attribute };
    if (tag.tagNameRange && offset <= tag.tagNameRange.end) return { kind: "tag-name", tagName: tag.tagName, tagRange: tag };
    return { kind: "attribute-name", tagName: tag.tagName, tagRange: tag };
  }
  return { kind: "html-text", tagName: null };
}

export function getHybridTokenContextAtOffset(document: HybridDocument, offset: number): TwigTokenContext {
  const node = findTwigNodeAtOffset(document, offset);
  if (!node) {
    const html = getHtmlContextAtOffset(document, offset);
    return { kind: "html", stringLike: html.kind === "attribute-value", hashKeyLike: false };
  }
  if (node.kind === "TwigComment") return { kind: "comment", stringLike: false, hashKeyLike: false };
  const tokens = lexTwig(node.inner, node.start + 2).filter((token) => token.kind !== "whitespace" && token.kind !== "eof");
  const current = tokens.find((token) => offset >= token.start && offset <= token.end);
  const previous = tokens.filter((token) => token.end <= offset).at(-1);
  return {
    kind: node.kind === "TwigOutput" || (node.kind === "IncompleteNode" && node.raw.startsWith("{{")) ? "output" : "tag",
    stringLike: current?.kind === "string",
    hashKeyLike: current?.kind !== "string" && (previous?.value === "{" || previous?.value === ",")
  };
}

export function getHybridCompletionContext(document: HybridDocument, offset: number): {
  unclosedTags: string[]; topLevelTag: string | null; allowedMiddleTags: string[]; preferredClosingTags: string[];
} {
  const stack: Array<{ name: string; middles: string[] }> = [];
  for (const node of document.children) {
    if (node.start >= offset || node.kind !== "TwigTag" || !node.tagName || !node.tagKind) continue;
    if (node.tagKind === "opening") stack.push({ name: node.tagName, middles: [] });
    else if (node.tagKind === "middle") {
      const index = findLastIndex(stack, (entry) => supportsMiddle(entry.name, node.tagName!));
      if (index >= 0) stack[index].middles.push(node.tagName);
    } else if (node.tagKind === "closing") {
      const opening = TWIG_CLOSERS[node.tagName];
      const index = findLastIndex(stack, (entry) => entry.name === opening);
      if (index >= 0) stack.splice(index, 1);
    }
  }
  const top = stack.at(-1);
  const allowedMiddleTags = !top ? [] : top.name === "if"
    ? [...(top.middles.includes("else") ? [] : ["elseif", "else"])]
    : top.name === "for" && !top.middles.includes("else") && !top.middles.includes("empty") ? ["else", "empty"] : [];
  return { unclosedTags: stack.map((item) => item.name), topLevelTag: top?.name ?? null, allowedMiddleTags, preferredClosingTags: [...stack].reverse().map((item) => getClosingTag(item.name)).filter((item): item is string => Boolean(item)) };
}

export function collectHybridSelectionRanges(document: HybridDocument, offset: number): SourceRange[] {
  const candidates: SourceRange[] = [];
  const twig = findTwigNodeAtOffset(document, offset);
  if (twig) {
    const tokens = lexTwig(twig.inner, twig.start + 2);
    const token = tokens.find((item) => item.kind !== "whitespace" && item.kind !== "eof" && offset >= item.start && offset <= item.end);
    if (token) candidates.push(token);
    const expressions = [twig.expression, ...(twig.statement?.arguments ?? [])].filter((item): item is TwigExpression => Boolean(item));
    for (const expression of expressions) visitTwigExpression(expression, (node) => { if (offset >= node.start && offset <= node.end) candidates.push(node); });
    const innerStart = twig.start + (twig.raw[2] === "-" || twig.raw[2] === "~" ? 3 : 2);
    const innerEnd = twig.end - (/[-~](?:\}\}|%\}|#\})$/.test(twig.raw) ? 3 : twig.complete ? 2 : 0);
    if (innerEnd >= innerStart) candidates.push({ start: innerStart, end: innerEnd });
    candidates.push(twig);
  }
  const lineStart = document.source.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
  const lineEnd = document.source.indexOf("\n", offset) < 0 ? document.end : document.source.indexOf("\n", offset);
  const line = trimRange(document.source, { start: lineStart, end: lineEnd }); if (line) candidates.push(line);
  for (const structure of flattenStructure(document.structure)) {
    if (offset < structure.start || offset > structure.end) continue;
    if (offset >= structure.openEnd && offset <= structure.closeStart) {
      const body = trimRange(document.source, { start: structure.openEnd, end: structure.closeStart }); if (body) candidates.push(body);
    }
    candidates.push(structure);
  }
  candidates.push({ start: 0, end: document.end });
  return candidates.filter((range, index, all) => range.start <= offset && range.end >= offset && all.findIndex((item) => item.start === range.start && item.end === range.end) === index)
    .sort((left, right) => (left.end - left.start) - (right.end - right.start))
    .filter((range, index, all) => index === 0 || (range.start <= all[index - 1].start && range.end >= all[index - 1].end));
}

function findTwigNodeAtOffset(document: HybridDocument, offset: number): TwigNode | null {
  for (const node of document.children) {
    if (node.start <= offset && node.end >= offset && (node.kind === "TwigTag" || node.kind === "TwigOutput" || node.kind === "TwigComment" || (node.kind === "IncompleteNode" && "inner" in node))) return node;
    if ("embeddedTwig" in node) {
      const embedded = node.embeddedTwig.find((item) => item.start <= offset && item.end >= offset); if (embedded) return embedded;
    }
  }
  return null;
}
function supportsMiddle(open: string, middle: string): boolean { return open === "if" ? middle === "else" || middle === "elseif" : open === "for" && (middle === "else" || middle === "empty"); }
function getClosingTag(open: string): string | null { const entry = Object.entries(TWIG_CLOSERS).find(([, value]) => value === open); return entry?.[0] ?? null; }
function flattenStructure(nodes: HybridStructureNode[]): HybridStructureNode[] { return nodes.flatMap((node) => [node, ...flattenStructure(node.children)]); }
function trimRange(source: string, range: SourceRange): SourceRange | null {
  let start = range.start; let end = range.end;
  while (start < end && /\s/.test(source[start])) start += 1;
  while (end > start && /\s/.test(source[end - 1])) end -= 1;
  return start < end ? { start, end } : null;
}

export function validateHybridDocument(document: HybridDocument): string[] {
  const errors: string[] = [];
  let offset = 0;
  for (const node of document.children) {
    if (node.start !== offset || node.end < node.start || node.raw.length !== node.end - node.start) {
      errors.push(`Invalid node range at ${node.start}:${node.end}.`);
    }
    offset = node.end;
    validateNodeSyntax(node, errors);
    if ("embeddedTwig" in node) node.embeddedTwig.forEach((twig) => validateNodeSyntax(twig, errors));
  }
  if (offset !== document.end || reconstructHybridDocument(document) !== document.source) {
    errors.push("Hybrid document is not lossless.");
  }
  return errors;
}

function validateNodeSyntax(node: HybridNode, errors: string[]): void {
  if (!(node.kind === "TwigTag" || node.kind === "TwigOutput" || node.kind === "TwigComment" || (node.kind === "IncompleteNode" && "inner" in node))) return;
  const contains = (range: SourceRange) => range.start >= node.start && range.end <= node.end && range.end >= range.start;
  if (node.expression) visitTwigExpression(node.expression, (syntax) => {
    if (!contains(syntax)) errors.push(`Invalid expression range at ${syntax.start}:${syntax.end}.`);
  });
  if (node.statement) {
    if (!contains(node.statement)) errors.push(`Invalid statement range at ${node.statement.start}:${node.statement.end}.`);
    for (const token of node.statement.tokens) if (!contains(token)) errors.push(`Invalid statement token range at ${token.start}:${token.end}.`);
    for (const binding of node.statement.bindings) if (!contains(binding)) errors.push(`Invalid binding range at ${binding.start}:${binding.end}.`);
    for (const argument of node.statement.arguments) visitTwigExpression(argument, (syntax) => {
      if (!contains(syntax)) errors.push(`Invalid statement expression range at ${syntax.start}:${syntax.end}.`);
    });
  }
}

function scanTwigNode(source: string, start: number, baseOffset = 0): TwigNode | null {
  const opening = source.slice(start, start + 2);
  const closing = opening === "{{" ? "}}" : opening === "{%" ? "%}" : opening === "{#" ? "#}" : null;
  if (!closing) return null;
  const closingStart = findTwigClosing(source, start + 2, closing);
  const complete = closingStart !== -1;
  const end = complete ? closingStart + 2 : source.length;
  const raw = source.slice(start, end);
  const inner = source.slice(start + 2, complete ? end - 2 : end);
  const absoluteStart = baseOffset + start;
  const absoluteEnd = baseOffset + end;
  const syntaxSource = stripWhitespaceControl(inner, absoluteStart + 2);
  if (!complete) {
    const syntax = opening === "{{"
      ? { expression: parseTwigExpression(syntaxSource.value, syntaxSource.start) }
      : opening === "{%" ? { statement: parseTwigStatement(syntaxSource.value, syntaxSource.start) } : {};
    return { kind: "IncompleteNode", raw, inner, complete, start: absoluteStart, end: absoluteEnd, ...syntax };
  }
  if (opening === "{{") return { kind: "TwigOutput", raw, inner, complete, start: absoluteStart, end: absoluteEnd, expression: parseTwigExpression(syntaxSource.value, syntaxSource.start) };
  if (opening === "{#") return { kind: "TwigComment", raw, inner, complete, start: absoluteStart, end: absoluteEnd };
  const normalized = inner.trim().replace(/^[-~]\s*/, "").replace(/\s*[-~]$/, "");
  return {
    kind: "TwigTag", raw, inner, complete, start: absoluteStart, end: absoluteEnd,
    tagName: getTwigTagName(normalized), tagKind: getTwigTagKind(normalized),
    statement: parseTwigStatement(syntaxSource.value, syntaxSource.start)
  };
}

function stripWhitespaceControl(inner: string, absoluteStart: number): { value: string; start: number } {
  const leading = inner.match(/^[-~]/)?.[0].length ?? 0;
  const trailing = inner.slice(leading).match(/[-~]$/)?.[0].length ?? 0;
  return { value: inner.slice(leading, trailing ? -trailing : undefined), start: absoluteStart + leading };
}

function findTwigClosing(source: string, start: number, closing: string): number {
  let quote: string | null = null;
  for (let index = start; index < source.length - 1; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"') quote = character;
    else if (source.startsWith(closing, index)) return index;
  }
  return -1;
}

function scanHtmlTag(source: string, start: number): HtmlTagNode | null {
  if (source[start] !== "<" || source.startsWith("<!--", start) || source.startsWith("<!", start) || source.startsWith("<?", start)) return null;
  const nameMatch = source.slice(start).match(/^<\s*(\/)?\s*([A-Za-z][\w:-]*)/);
  if (!nameMatch) return null;
  let quote: string | null = null;
  let end = source.length;
  let complete = false;
  for (let index = start + nameMatch[0].length; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = null;
    } else if (character === "'" || character === '"') quote = character;
    else if (character === "{" && /[{%#]/.test(source[index + 1] ?? "")) {
      const closing = source[index + 1] === "{" ? "}}" : source[index + 1] === "%" ? "%}" : "#}";
      const twigEnd = findTwigClosing(source, index + 2, closing);
      if (twigEnd === -1) break;
      index = twigEnd + 1;
    } else if (character === ">") { end = index + 1; complete = true; break; }
  }
  const raw = source.slice(start, end);
  const closing = Boolean(nameMatch[1]);
  const tagName = nameMatch[2].toLowerCase();
  const embeddedTwig = collectEmbeddedTwig(raw, start);
  const attributes = closing ? [] : parseHtmlAttributes(raw, start, nameMatch[0].length, embeddedTwig, complete);
  return {
    kind: complete ? (closing ? "HtmlCloseTag" : "HtmlOpenTag") : "IncompleteNode",
    raw, start, end, tagName, complete,
    selfClosing: !closing && (/\/\s*>$/.test(raw) || VOID_HTML_TAGS.has(tagName)),
    attributes,
    attributeSegments: closing ? [] : buildAttributeSegments(attributes, embeddedTwig),
    embeddedTwig,
    tagNameRange: {
      start: start + nameMatch[0].lastIndexOf(nameMatch[2]),
      end: start + nameMatch[0].lastIndexOf(nameMatch[2]) + nameMatch[2].length
    }
  };
}

function parseHtmlAttributes(raw: string, absoluteStart: number, contentStart: number, twigNodes: TwigNode[], tagComplete: boolean): HtmlAttribute[] {
  const attributes: HtmlAttribute[] = [];
  const bodyEnd = raw.replace(/\/?\s*>?$/, "").length;
  const masked = [...raw];
  for (const twig of twigNodes) {
    for (let index = twig.start - absoluteStart; index < twig.end - absoluteStart; index += 1) if (masked[index] !== "\n" && masked[index] !== "\r") masked[index] = " ";
  }
  const pattern = /([^\s=/>]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g;
  pattern.lastIndex = contentStart;
  const searchable = masked.join("");
  for (let match = pattern.exec(searchable); match && match.index < bodyEnd; match = pattern.exec(searchable)) {
    const start = absoluteStart + match.index;
    const end = start + match[0].length;
    const nameStart = start;
    const value = match[2];
    const quote = value?.startsWith('"') ? '"' : value?.startsWith("'") ? "'" : null;
    const valueStart = value ? absoluteStart + match.index + match[0].lastIndexOf(value) : undefined;
    attributes.push({
      kind: "HtmlAttribute", name: match[1], raw: raw.slice(match.index, match.index + match[0].length), start, end,
      nameRange: { start: nameStart, end: nameStart + match[1].length },
      valueRange: valueStart === undefined ? undefined : { start: valueStart, end },
      valueContentRange: valueStart === undefined ? undefined : { start: valueStart + (quote ? 1 : 0), end: end - (quote && value.endsWith(quote) ? 1 : 0) },
      quote,
      incomplete: !tagComplete && end === absoluteStart + bodyEnd
    });
  }
  return attributes;
}

function buildAttributeSegments(attributes: HtmlAttribute[], twigNodes: TwigNode[]): HtmlAttributeSegment[] {
  return [
    ...attributes,
    ...twigNodes.map((node): HtmlTwigAttributeSegment => ({ kind: "TwigAttributeSegment", node, start: node.start, end: node.end }))
  ].sort((left, right) => left.start - right.start);
}

function collectEmbeddedTwig(raw: string, absoluteStart: number): TwigNode[] {
  const nodes: TwigNode[] = [];
  for (let offset = 0; offset < raw.length;) {
    const relative = raw.slice(offset).search(/\{[{%#]/);
    if (relative === -1) break;
    const node = scanTwigNode(raw, offset + relative, absoluteStart);
    if (!node) { offset += relative + 1; continue; }
    nodes.push(node);
    offset = node.end - absoluteStart;
  }
  return nodes;
}

function findNextConstruct(source: string, start: number): number {
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === "<" || (source[index] === "{" && /[{%#]/.test(source[index + 1] ?? ""))) return index;
  }
  return -1;
}

function pairHtmlElements(nodes: HybridNode[]): NodePair[] {
  const stack: HtmlTagNode[] = [];
  const pairs: NodePair[] = [];
  for (const node of nodes) {
    if (node.kind === "HtmlOpenTag" && !node.selfClosing) stack.push(node);
    else if (node.kind === "HtmlCloseTag" && node.tagName) {
      const index = findLastIndex(stack, (open) => open.tagName === node.tagName);
      if (index >= 0) {
        const open = stack.splice(index, 1)[0];
        pairs.push(makePair("HtmlElement", node.tagName, open, node));
      }
    }
  }
  return pairs.sort((left, right) => left.start - right.start);
}

function pairTwigBlocks(nodes: HybridNode[]): NodePair[] {
  const stack: TwigNode[] = [];
  const pairs: NodePair[] = [];
  for (const node of nodes) {
    if (node.kind !== "TwigTag" || !node.tagName || !node.tagKind) continue;
    if (node.tagKind === "opening") stack.push(node);
    else if (node.tagKind === "closing") {
      const opening = TWIG_CLOSERS[node.tagName];
      const index = findLastIndex(stack, (candidate) => candidate.tagName === opening);
      if (index >= 0) {
        const open = stack.splice(index, 1)[0];
        pairs.push(makePair("TwigControlBlock", opening, open, node));
      }
    }
  }
  return pairs.sort((left, right) => left.start - right.start);
}

function makePair(kind: NodePair["kind"], name: string, open: SourceRange, close: SourceRange): NodePair {
  return { kind, name, start: open.start, end: close.end, openStart: open.start, openEnd: open.end, closeStart: close.start, closeEnd: close.end };
}

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) if (predicate(items[index])) return index;
  return -1;
}
