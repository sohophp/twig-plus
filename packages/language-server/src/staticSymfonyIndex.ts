import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { SymfonyReferenceKind } from "./symfonyReference";

export interface StaticSymfonyReference {
  kind: SymfonyReferenceKind;
  name: string;
  detail: string;
  source: { path: string; line: number; character: number };
}

const MAX_STATIC_FILES = 2_000;
const MAX_STATIC_FILE_BYTES = 1_000_000;

export async function readStaticSymfonyReferences(root: string): Promise<StaticSymfonyReference[]> {
  const result: StaticSymfonyReference[] = [];
  const candidates = [path.join(root, "config", "routes"), path.join(root, "translations")];
  const files: string[] = [];
  for (const candidate of candidates) files.push(...await collectFiles(candidate, { remaining: MAX_STATIC_FILES }));
  for (const file of [
    path.join(root, "config", "routes.yaml"), path.join(root, "config", "routes.yml"),
    path.join(root, "config", "packages", "security.yaml"), path.join(root, "config", "packages", "security.yml"),
    path.join(root, "config", "packages", "twig.yaml"), path.join(root, "config", "packages", "twig.yml"),
    path.join(root, "importmap.php")
  ]) {
    try { if ((await stat(file)).isFile()) files.push(file); } catch { /* optional conventional file */ }
  }
  for (const file of [...new Set(files)].slice(0, MAX_STATIC_FILES)) {
    try {
      if ((await stat(file)).size > MAX_STATIC_FILE_BYTES) continue;
      const source = await readFile(file, "utf8");
      const relative = path.relative(root, file).replaceAll(path.sep, "/");
      if (relative.startsWith("config/routes")) {
        if (/\.xml$/i.test(file)) result.push(...parseRouteXml(source, relative));
        else if (/\.ya?ml$/i.test(file)) result.push(...parseRouteYaml(source, relative));
      }
      else if (/config\/packages\/security\.ya?ml$/i.test(relative)) result.push(...parseSecurityYaml(source, relative));
      else if (/config\/packages\/twig\.ya?ml$/i.test(relative)) result.push(...parseTwigConfigYaml(source, relative));
      else if (/\.xlf|\.xliff$/i.test(file)) result.push(...parseTranslationXliff(source, relative));
      else if (/\.ya?ml$/i.test(file)) result.push(...parseTranslationYaml(source, relative));
      else if (/\.json$/i.test(file)) result.push(...parseTranslationJson(source, relative));
      else if (path.basename(file) === "importmap.php") result.push(...parseLiteralImportmap(source, relative));
    } catch { /* malformed optional static files never block Twig */ }
  }
  result.push(...await collectPublicAssets(root));
  return result.filter((entry, index, all) => all.findIndex((item) => item.kind === entry.kind && item.name === entry.name) === index);
}

export function parseRouteYaml(source: string, file = "config/routes.yaml"): StaticSymfonyReference[] {
  return source.split(/\r?\n/).flatMap((line, index) => {
    const controller = line.match(/^\s*(?:_controller|controller):\s*['"]?([A-Za-z_\\][A-Za-z0-9_\\]*(?:::[A-Za-z_][A-Za-z0-9_]*)?)['"]?\s*(?:#.*)?$/);
    if (controller) return [reference("fragment", controller[1], "Symfony controller fragment", file, index, line.indexOf(controller[1]))];
    const match = line.match(/^([A-Za-z0-9_.-]+):\s*(?:#.*)?$/);
    if (!match || ["resource", "type", "prefix", "name_prefix", "host", "schemes", "methods", "defaults", "requirements", "options", "condition"].includes(match[1])) return [];
    return [reference("route", match[1], "Symfony route", file, index, 0)];
  });
}

export function parseRouteXml(source: string, file = "config/routes.xml"): StaticSymfonyReference[] {
  const routes = [...source.matchAll(/<route\b[^>]*\bid=["']([^"']+)["']/gi)].map((match) => {
    const position = positionAt(source, (match.index ?? 0) + match[0].indexOf(match[1]));
    return reference("route", match[1], "Symfony XML route", file, position.line, position.character);
  });
  const fragments = [...source.matchAll(/<default\b[^>]*\bkey=["']_controller["'][^>]*>\s*([^<\s]+)\s*<\/default>/gi)].map((match) => {
    const position = positionAt(source, (match.index ?? 0) + match[0].indexOf(match[1]));
    return reference("fragment", match[1], "Symfony XML controller fragment", file, position.line, position.character);
  });
  return [...routes, ...fragments];
}

export function parseSecurityYaml(source: string, file = "config/packages/security.yaml"): StaticSymfonyReference[] {
  const lines = source.split(/\r?\n/); const result: StaticSymfonyReference[] = [];
  let hierarchyIndent = -1;
  lines.forEach((line, index) => {
    const section = line.match(/^(\s*)role_hierarchy:\s*(?:#.*)?$/);
    if (section) { hierarchyIndent = section[1].length; return; }
    if (hierarchyIndent < 0 || !line.trim() || line.trimStart().startsWith("#")) return;
    const indent = line.length - line.trimStart().length;
    if (indent <= hierarchyIndent) { hierarchyIndent = -1; return; }
    for (const match of line.matchAll(/\bROLE_[A-Z0-9_]+\b/g)) result.push(reference("security", match[0], "Symfony security role", file, index, match.index ?? 0));
  });
  return result;
}

export function parseTwigConfigYaml(source: string, file = "config/packages/twig.yaml"): StaticSymfonyReference[] {
  const lines = source.split(/\r?\n/); const result: StaticSymfonyReference[] = [];
  let themesIndent = -1;
  lines.forEach((line, index) => {
    const section = line.match(/^(\s*)form_themes:\s*(?:#.*)?$/);
    if (section) { themesIndent = section[1].length; return; }
    if (themesIndent < 0 || !line.trim() || line.trimStart().startsWith("#")) return;
    const indent = line.length - line.trimStart().length;
    if (indent <= themesIndent) { themesIndent = -1; return; }
    const theme = line.match(/^\s*-\s*['"]?([^'"#\s]+\.twig)['"]?\s*(?:#.*)?$/);
    if (theme) result.push(reference("form", theme[1], "Symfony form theme", file, index, line.indexOf(theme[1])));
  });
  return result;
}

export function parseTranslationYaml(source: string, file: string): StaticSymfonyReference[] {
  const stack: Array<{ indent: number; key: string }> = [];
  const result: StaticSymfonyReference[] = [];
  source.split(/\r?\n/).forEach((line, index) => {
    const match = line.match(/^(\s*)([A-Za-z0-9_.-]+):(?:\s*(.*))?$/); if (!match) return;
    const indent = match[1].length; while (stack.length && stack.at(-1)!.indent >= indent) stack.pop();
    const key = match[2]; const value = match[3]?.trim();
    const name = [...stack.map((item) => item.key), key].join(".");
    if (value && value !== "|" && value !== ">") result.push(reference("translation", name, "Symfony translation", file, index, indent));
    else stack.push({ indent, key });
  });
  return result;
}

export function parseTranslationXliff(source: string, file: string): StaticSymfonyReference[] {
  return [...source.matchAll(/<(?:trans-unit|unit)\b[^>]*(?:resname|id)=["']([^"']+)["']/gi)].map((match) => {
    const position = positionAt(source, (match.index ?? 0) + match[0].indexOf(match[1]));
    return reference("translation", match[1], "Symfony XLIFF translation", file, position.line, position.character);
  });
}

export function parseTranslationJson(source: string, file: string): StaticSymfonyReference[] {
  try {
    const value = JSON.parse(source); if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    return Object.keys(value).map((name) => reference("translation", name, "Symfony JSON translation", file, 0, 0));
  } catch { return []; }
}

export function parseLiteralImportmap(source: string, file = "importmap.php"): StaticSymfonyReference[] {
  if (!/^\s*<\?php[\s\S]*\breturn\s*\[/m.test(source) || /\b(?:require|include|eval|function|new|shell_exec|exec)\b/i.test(source)) return [];
  return [...source.matchAll(/['"]([^'"]+)['"]\s*=>\s*\[/g)].map((match) => {
    const position = positionAt(source, (match.index ?? 0) + match[0].indexOf(match[1]));
    return reference("importmap", match[1], "Symfony importmap entrypoint", file, position.line, position.character);
  });
}

async function collectPublicAssets(root: string): Promise<StaticSymfonyReference[]> {
  const directory = path.join(root, "public");
  const files = await collectFiles(directory, { remaining: MAX_STATIC_FILES });
  return files.map((file) => reference("asset", path.relative(directory, file).replaceAll(path.sep, "/"), "Public asset", path.relative(root, file).replaceAll(path.sep, "/"), 0, 0));
}

async function collectFiles(directory: string, budget: { remaining: number }): Promise<string[]> {
  if (budget.remaining <= 0) return [];
  let entries; try { entries = await readdir(directory, { withFileTypes: true }); } catch { return []; }
  const files: string[] = [];
  for (const entry of entries) {
    if (budget.remaining-- <= 0 || entry.name.startsWith(".")) break;
    const item = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(item, budget)); else if (entry.isFile()) files.push(item);
  }
  return files;
}

function reference(kind: SymfonyReferenceKind, name: string, detail: string, file: string, line: number, character: number): StaticSymfonyReference {
  return { kind, name, detail, source: { path: file, line, character } };
}
function positionAt(source: string, offset: number): { line: number; character: number } {
  const lines = source.slice(0, offset).split(/\r?\n/); return { line: lines.length - 1, character: lines.at(-1)?.length ?? 0 };
}
