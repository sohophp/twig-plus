import { CompletionItemKind, InsertTextFormat, TextEdit, type CompletionItem } from "vscode-languageserver/node";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { getHybridCompletionContext, getHybridTokenContextAtOffset, type HybridDocument } from "@twig-plus/parser";
import { getSymfonyTwigCallables, getSymfonyTwigTags, selectTwigSpec, type TwigCallableKind } from "@twig-plus/language-spec";

interface Entry { label: string; detail: string; insertText?: string; priority?: number; signature?: string; documentation?: string; source?: "twig-core" | "twig-extra" | "symfony-bridge" | "project"; package?: string; }
export interface ProjectCompletionEntry { kind: "tag" | "filter" | "function" | "test"; name: string; detail?: string; signature?: string; documentation?: string; }
export interface TwigCatalogEntry { kind: ProjectCompletionEntry["kind"]; name: string; detail: string; signature?: string; documentation?: string; }

export class TwigCompletionRegistry {
  private project: ProjectCompletionEntry[] = [];
  private packages = new Set<string>();
  private packageVersions = new Map<string, string>();
  replaceProject(entries: ProjectCompletionEntry[]): void { this.project = [...entries]; }
  setPackages(packages: string[]): void { this.packages = new Set(packages); }
  setPackageVersions(versions: Record<string, string>): void { this.packageVersions = new Map(Object.entries(versions)); }
  getSymfonyVersion(): string | undefined { return this.packageVersions.get("symfony/twig-bridge")?.replace(/^v/, ""); }
  hasAnyPackage(packages: readonly string[]): boolean { return packages.some((name) => this.packages.has(name)); }
  permits(source: Entry["source"], packageName?: string): boolean {
    if (!source || source === "twig-core" || source === "project") return true;
    if (source === "symfony-bridge") return (!packageName || this.packages.has(packageName))
      && [...this.packages].some((name) => name === "symfony/twig-bridge" || name === "symfony/twig-bundle" || name === "symfony/framework-bundle");
    return [...this.packages].some((name) => name === "twig/extra-bundle" || /^twig\/.+-extra$/.test(name));
  }
  find(name: string, kinds?: ProjectCompletionEntry["kind"][]): TwigCatalogEntry | null {
    const entry = this.project.find((item) => item.name === name && (!kinds || kinds.includes(item.kind)));
    return entry ? { kind: entry.kind, name: entry.name, detail: entry.detail ?? `Project Twig ${entry.kind}`, signature: entry.signature, documentation: entry.documentation } : null;
  }
  get(kind: "tag" | "filter" | "function" | "test"): Entry[] {
    return this.project.filter((entry) => entry.kind === kind).map((entry) => ({
      label: entry.name, detail: entry.detail ?? `Project Twig ${entry.kind}`,
      insertText: entry.kind === "function" && entry.signature ? `${entry.name}(\${1})` : undefined,
      signature: entry.signature, documentation: entry.documentation,
      priority: 120, source: "project"
    }));
  }
}

const tagsFor = (version?: string, symfonyVersion?: string): Entry[] => [
  ...selectTwigSpec(version).tags.filter((tag) => tag.form !== "closing"),
  ...getSymfonyTwigTags(symfonyVersion)
].map((tag) => ({
  label: tag.name, detail: `${tag.source} Twig tag`, insertText: tag.snippet, priority: tag.form === "branch" ? 92 : 70,
  source: tag.source === "symfony-bridge" ? "symfony-bridge" : "twig-core", package: tag.package
}));
const catalogEntries = (kind: TwigCallableKind, version?: string, symfonyVersion?: string): Entry[] => [
  ...selectTwigSpec(version).callables.filter((entry) => entry.source !== "symfony-bridge"),
  ...getSymfonyTwigCallables(symfonyVersion)
].filter((entry) => entry.kind === kind).map((entry) => ({
  label: entry.name, detail: `${entry.source} Twig ${entry.kind}`, signature: entry.signature,
  documentation: entry.documentation, insertText: kind === "function" ? `${entry.name}(\${1})` : undefined,
  source: entry.source === "twig-extra" ? "twig-extra" : entry.source === "symfony-bridge" ? "symfony-bridge" : "twig-core",
  package: entry.package
}));
const specialSymfonyFunctions: Entry[] = [
  ["path", "path('${1:route_name}'${2})", "symfony/routing"], ["url", "url('${1:route_name}'${2})", "symfony/routing"],
  ["asset", "asset('${1:path}')", "symfony/asset"],
  ["csrf_token", "csrf_token('${1:intention}')", "symfony/twig-bridge"], ["is_granted", "is_granted('${1:ROLE_USER}')", "symfony/security-core"]
].map(([label, insertText, packageName]) => ({ label, detail: "symfony-bridge Twig function", insertText, source: "symfony-bridge" as const, package: packageName }));
const entriesFor = (kind: TwigCallableKind | "tag", version?: string, symfonyVersion?: string): Entry[] => {
  if (kind === "tag") return tagsFor(version, symfonyVersion);
  if (kind !== "function") return catalogEntries(kind, version, symfonyVersion);
  return [...specialSymfonyFunctions, ...catalogEntries("function", version, symfonyVersion).filter((entry) => !specialSymfonyFunctions.some((current) => current.label === entry.label))];
};
const bridgeSignatures: Record<string, string> = {
  path: "path(route_name, parameters = {}, relative = false)", url: "url(route_name, parameters = {}, schemeRelative = false)",
  asset: "asset(path, packageName = null)", include: "include(template, variables = {}, withContext = true, ignoreMissing = false)",
  source: "source(name, ignoreMissing = false)", dump: "dump(...values)", csrf_token: "csrf_token(intention)",
  is_granted: "is_granted(attribute, subject = null)", date: "date(format = null, timezone = null)",
  default: "default(defaultValue = '')", replace: "replace(from)", slice: "slice(start, length = null)",
  round: "round(precision = 0, method = 'common')", number_format: "number_format(decimal = 0, decimalPoint = '.', thousandSeparator = ',')",
  range: "range(low, high, step = 1)", random: "random(values = null, max = null)"
};

export function getTwigCatalogEntry(name: string, registry?: TwigCompletionRegistry, preferredKinds?: ProjectCompletionEntry["kind"][], version?: string): TwigCatalogEntry | null {
  const project = registry?.find(name, preferredKinds); if (project) return project;
  for (const kind of ["tag", "filter", "function", "test"] as const) {
    if (preferredKinds && !preferredKinds.includes(kind)) continue;
    const source = entriesFor(kind, version, registry?.getSymfonyVersion());
    const entry = source.find((item) => item.label === name && (registry?.permits(item.source, item.package) ?? (item.source !== "twig-extra" && item.source !== "symfony-bridge")));
    if (entry) return { kind, name, detail: entry.detail, signature: entry.signature ?? bridgeSignatures[name], documentation: entry.documentation };
  }
  return null;
}

export function getTwigCompletions(document: TextDocument, syntax: HybridDocument, offset: number, registry?: TwigCompletionRegistry, version?: string): CompletionItem[] {
  const context = getHybridTokenContextAtOffset(syntax, offset);
  if (context.kind === "html" || context.kind === "comment" || context.stringLike || context.hashKeyLike) return [];
  const line = document.positionAt(offset).line;
  const lineStart = document.offsetAt({ line, character: 0 });
  const match = matchCompletion(document.getText().slice(lineStart, offset));
  if (!match || (match.kind === "tag" && context.kind !== "tag")) return [];
  const range = { start: document.positionAt(lineStart + match.start), end: document.positionAt(offset) };
  const spec = selectTwigSpec(version);
  let source = entriesFor(match.kind, version, registry?.getSymfonyVersion());
  source = [...(registry?.get(match.kind) ?? []), ...source];
  source = source.filter((entry) => registry?.permits(entry.source, entry.package) ?? (entry.source !== "twig-extra" && entry.source !== "symfony-bridge"));
  if (match.kind === "tag") {
    const structural = getHybridCompletionContext(syntax, offset);
    source = source.filter((entry) => !spec.tags.some((tag) => tag.name === entry.label && tag.form === "branch") || structural.allowedMiddleTags.includes(entry.label));
  }
  const items = source.filter((entry) => matches(entry.label, match.prefix)).map((entry) => item(entry, match.kind, range, match.prefix));
  if (match.kind === "tag") {
    const preferred = getHybridCompletionContext(syntax, offset).preferredClosingTags;
    const closing = spec.tags.filter((tag) => tag.form === "closing").map((tag) => tag.name);
    for (const label of [...preferred, ...closing].filter((value, index, all) => all.indexOf(value) === index)) {
      if (matches(label, match.prefix)) items.push(item({ label, detail: "Twig closing tag", priority: 120 }, "tag", range, match.prefix));
    }
  }
  return items.sort((a, b) => String(a.sortText).localeCompare(String(b.sortText)));
}

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
