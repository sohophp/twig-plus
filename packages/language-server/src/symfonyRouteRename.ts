import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { collectSymfonyReferences } from "./symfonyReference";

export interface SymfonyRouteRenameEdit { uri: string; start: number; end: number; }
export interface SymfonyRouteRenameResult { complete: boolean; edits: SymfonyRouteRenameEdit[]; }

const EXCLUDED_DIRECTORIES = new Set([".git", ".hg", ".svn", ".idea", ".vscode", "node_modules", "vendor", "dist", "build", "coverage", "cache", ".cache", "var"]);

/** Collect every supported route string from a bounded project snapshot. */
export async function collectSymfonyRouteRenameEdits(
  root: string,
  oldName: string,
  openDocuments: ReadonlyMap<string, string> = new Map(),
  cancelled: () => boolean = () => false,
  limits = { maxFiles: 20_000, maxFileBytes: 2_000_000 },
  uriForPath: (file: string) => string = (file) => pathToFileURL(file).toString()
): Promise<SymfonyRouteRenameResult> {
  const directories = [path.resolve(root)];
  const files: string[] = [];
  while (directories.length) {
    if (cancelled()) return { complete: false, edits: [] };
    const directory = directories.pop()!;
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); }
    catch { return { complete: false, edits: [] }; }
    for (const entry of entries) {
      if (cancelled()) return { complete: false, edits: [] };
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRECTORIES.has(entry.name)) directories.push(path.join(directory, entry.name));
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".twig")) {
        if (files.length >= limits.maxFiles) return { complete: false, edits: [] };
        files.push(path.join(directory, entry.name));
      }
    }
  }
  const edits: SymfonyRouteRenameEdit[] = [];
  for (const file of files.sort()) {
    if (cancelled()) return { complete: false, edits: [] };
    const uri = uriForPath(file);
    let source = openDocuments.get(uri);
    if (source === undefined) {
      try {
        if ((await stat(file)).size > limits.maxFileBytes) return { complete: false, edits: [] };
        source = await readFile(file, "utf8");
      } catch { return { complete: false, edits: [] }; }
    }
    if (source.length > limits.maxFileBytes) return { complete: false, edits: [] };
    for (const reference of collectSymfonyReferences(source)) {
      if (reference.kind === "route" && reference.prefix === oldName) edits.push({ uri, start: reference.start, end: reference.end });
    }
  }
  return { complete: true, edits };
}
