import { CompletionItemKind, InsertTextFormat, TextEdit, type CompletionItem } from "vscode-languageserver/node";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { getHybridCompletionContext, getHybridTokenContextAtOffset, type HybridDocument } from "@twig-plus/parser";

interface Entry { label: string; detail: string; insertText?: string; priority?: number; signature?: string; documentation?: string; }
export interface ProjectCompletionEntry { kind: "tag" | "filter" | "function" | "test"; name: string; detail?: string; signature?: string; documentation?: string; }
export interface TwigCatalogEntry { kind: ProjectCompletionEntry["kind"]; name: string; detail: string; signature?: string; documentation?: string; }

export class TwigCompletionRegistry {
  private project: ProjectCompletionEntry[] = [];
  replaceProject(entries: ProjectCompletionEntry[]): void { this.project = [...entries]; }
  find(name: string, kinds?: ProjectCompletionEntry["kind"][]): TwigCatalogEntry | null {
    const entry = this.project.find((item) => item.name === name && (!kinds || kinds.includes(item.kind)));
    return entry ? { kind: entry.kind, name: entry.name, detail: entry.detail ?? `Project Twig ${entry.kind}`, signature: entry.signature, documentation: entry.documentation } : null;
  }
  get(kind: "tag" | "filter" | "function" | "test"): Entry[] {
    return this.project.filter((entry) => entry.kind === kind).map((entry) => ({
      label: entry.name, detail: entry.detail ?? `Project Twig ${entry.kind}`,
      insertText: entry.kind === "function" && entry.signature ? `${entry.name}(\${1})` : undefined,
      signature: entry.signature, documentation: entry.documentation,
      priority: 120
    }));
  }
}

const tags: Entry[] = [
  ["if", "if ${1:condition}", 100], ["for", "for ${1:item} in ${2:items}", 95],
  ["block", "block ${1:name}", 95], ["else", "else", 92], ["elseif", "elseif ${1:condition}", 91],
  ["empty", "empty", 89], ["include", "include '${1:template.html.twig}'", 90],
  ["extends", "extends '${1:base.html.twig}'", 90], ["embed", "embed '${1:template.html.twig}'", 85],
  ["set", "set ${1:name} = ${2:value}", 80], ["macro", "macro ${1:name}(${2:args})", 75],
  ["with", "with ${1:context}", 70], ["apply", "apply ${1:filter}", 70],
  ["import", "import '${1:macros.html.twig}' as ${2:macros}", 65],
  ["from", "from '${1:macros.html.twig}' import ${2:macro}", 64]
].map(([label, insertText, priority]) => ({ label: String(label), detail: "Twig tag", insertText: String(insertText), priority: Number(priority) }));
for (const label of ["autoescape", "cache", "guard", "sandbox", "types", "verbatim", "deprecated", "do", "flush", "props", "use"]) {
  tags.push({ label, detail: "Twig tag", insertText: `${label} \${1}`, priority: 50 });
}

const filters = entries("filter", ["escape", "raw", "date", "length", "default", "json_encode", "join", "split", "merge", "upper", "lower", "capitalize", "abs", "batch", "column", "first", "format", "keys", "last", "map", "nl2br", "number_format", "reduce", "replace", "reverse", "round", "slice", "sort", "striptags", "title", "trim", "url_encode"]);
const functions: Entry[] = [
  ["path", "path('${1:route_name}'${2})"], ["url", "url('${1:route_name}'${2})"],
  ["asset", "asset('${1:path}')"], ["include", "include('${1:template.html.twig}')"],
  ["source", "source('${1:template.html.twig}')"], ["dump", "dump(${1:value})"],
  ["csrf_token", "csrf_token('${1:intention}')"], ["is_granted", "is_granted('${1:ROLE_USER}')"]
].map(([label, insertText]) => ({ label, detail: "Twig function", insertText }));
for (const label of ["attribute", "block", "constant", "cycle", "date", "enum", "max", "min", "parent", "random", "range"]) functions.push({ label, detail: "Twig function", insertText: `${label}(\${1})` });
const tests = entries("test", ["constant", "defined", "divisible by", "empty", "enum", "even", "iterable", "mapping", "null", "odd", "same as", "sequence", "string", "true", "false"]);
const closing = ["endif", "endfor", "endblock", "endembed", "endmacro", "endwith", "endapply", "endautoescape", "endcache", "endguard", "endsandbox", "endset", "endtypes", "endverbatim"];
const signatures: Record<string, string> = {
  path: "path(route_name, parameters = {}, relative = false)", url: "url(route_name, parameters = {}, schemeRelative = false)",
  asset: "asset(path, packageName = null)", include: "include(template, variables = {}, withContext = true, ignoreMissing = false)",
  source: "source(name, ignoreMissing = false)", dump: "dump(...values)", csrf_token: "csrf_token(intention)",
  is_granted: "is_granted(attribute, subject = null)", date: "date(format = null, timezone = null)",
  default: "default(defaultValue = '')", replace: "replace(from)", slice: "slice(start, length = null)",
  round: "round(precision = 0, method = 'common')", number_format: "number_format(decimal = 0, decimalPoint = '.', thousandSeparator = ',')",
  range: "range(low, high, step = 1)", random: "random(values = null, max = null)"
};

export function getTwigCatalogEntry(name: string, registry?: TwigCompletionRegistry, preferredKinds?: ProjectCompletionEntry["kind"][]): TwigCatalogEntry | null {
  const project = registry?.find(name, preferredKinds); if (project) return project;
  for (const [kind, source] of [["tag", tags], ["filter", filters], ["function", functions], ["test", tests]] as const) {
    if (preferredKinds && !preferredKinds.includes(kind)) continue;
    const entry = source.find((item) => item.label === name);
    if (entry) return { kind, name, detail: entry.detail, signature: entry.signature ?? signatures[name], documentation: entry.documentation };
  }
  return null;
}

export function getTwigCompletions(document: TextDocument, syntax: HybridDocument, offset: number, registry?: TwigCompletionRegistry): CompletionItem[] {
  const context = getHybridTokenContextAtOffset(syntax, offset);
  if (context.kind === "html" || context.kind === "comment" || context.stringLike || context.hashKeyLike) return [];
  const line = document.positionAt(offset).line;
  const lineStart = document.offsetAt({ line, character: 0 });
  const match = matchCompletion(document.getText().slice(lineStart, offset));
  if (!match || (match.kind === "tag" && context.kind !== "tag")) return [];
  const range = { start: document.positionAt(lineStart + match.start), end: document.positionAt(offset) };
  let source = match.kind === "tag" ? tags : match.kind === "filter" ? filters : match.kind === "test" ? tests : functions;
  source = [...(registry?.get(match.kind) ?? []), ...source];
  if (match.kind === "tag") {
    const structural = getHybridCompletionContext(syntax, offset);
    source = source.filter((entry) => !["else", "elseif", "empty"].includes(entry.label) || structural.allowedMiddleTags.includes(entry.label));
  }
  const items = source.filter((entry) => matches(entry.label, match.prefix)).map((entry) => item(entry, match.kind, range, match.prefix));
  if (match.kind === "tag") {
    const preferred = getHybridCompletionContext(syntax, offset).preferredClosingTags;
    for (const label of [...preferred, ...closing].filter((value, index, all) => all.indexOf(value) === index)) {
      if (matches(label, match.prefix)) items.push(item({ label, detail: "Twig closing tag", priority: 120 }, "tag", range, match.prefix));
    }
  }
  return items.sort((a, b) => String(a.sortText).localeCompare(String(b.sortText)));
}

function entries(kind: string, labels: string[]): Entry[] { return labels.map((label) => ({ label, detail: `Twig ${kind}` })); }
function matches(label: string, query: string): boolean { return label.toLowerCase().includes(query.toLowerCase()); }
function score(label: string, query: string, priority = 0): string {
  const value = label.toLowerCase(); const q = query.toLowerCase();
  const bucket = !q || value === q ? 0 : value.startsWith(q) ? 1 : 2;
  return `${bucket}-${String(999 - priority).padStart(3, "0")}-${value}`;
}
function item(entry: Entry, kind: "tag" | "filter" | "function" | "test", range: TextEdit["range"], query: string): CompletionItem {
  const insert = entry.insertText ?? entry.label;
  return {
    label: entry.label, detail: entry.detail,
    kind: kind === "tag" ? CompletionItemKind.Keyword : kind === "function" ? CompletionItemKind.Function : CompletionItemKind.Operator,
    insertTextFormat: entry.insertText ? InsertTextFormat.Snippet : InsertTextFormat.PlainText,
    textEdit: TextEdit.replace(range, insert), sortText: score(entry.label, query, entry.priority)
  };
}

function matchCompletion(prefix: string): { kind: "tag" | "filter" | "function" | "test"; prefix: string; start: number } | null {
  let match = prefix.match(/\{%\s*([A-Za-z_]*)$/);
  if (match) return { kind: "tag", prefix: match[1].toLowerCase(), start: prefix.length - match[1].length };
  match = prefix.match(/\{\{[\s\S]*\|\s*([A-Za-z_]*)$/);
  if (match) return { kind: "filter", prefix: match[1].toLowerCase(), start: prefix.length - match[1].length };
  match = prefix.match(/\bis\s+(?:not\s+)?([A-Za-z_ ]*)$/);
  if (match) return { kind: "test", prefix: match[1].toLowerCase(), start: prefix.length - match[1].length };
  match = prefix.match(/\{\{[\s\S]*?\b([A-Za-z_][A-Za-z0-9_]*)$/);
  if (match) return { kind: "function", prefix: match[1].toLowerCase(), start: prefix.length - match[1].length };
  return null;
}
