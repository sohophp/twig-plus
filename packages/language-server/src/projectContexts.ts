import { collectTemplateReferenceAliases, DEFAULT_TEMPLATE_ROOTS, mapWorkspaceTemplateToReferenceWithRoots,
  sortWorkspaceTemplatePaths, type TemplateNamespaces } from "@twig-plus/parser";

export interface TemplateContextWorkspace {
  rootUri: string;
  templates: string[];
  roots?: string[];
  namespaces?: TemplateNamespaces;
}

export interface LoadedControllerSource { controller: string; uri: string; line: number; character: number; }
export interface LoadedControllerVariableSource { uri: string; line: number; character: number; length?: number; }
export interface LoadedControllerContext {
  projectRootUri: string;
  template: string;
  complete: boolean;
  variables: Record<string, string>;
  optionalVariables?: string[];
  variableSources?: Record<string, LoadedControllerVariableSource[]>;
  sources: LoadedControllerSource[];
  types?: Record<string, { name: string; members: Array<{ name: string; kind: "property" | "method"; type?: string; signature?: string; documentation?: string; sources?: Array<{ uri: string; line: number; character: number; length?: number }> }> }>;
}

/** Resolves a template only inside its workspace root, preferring the longest matching path. */
export class ProjectContextIndex {
  private readonly byRoot = new Map<string, Map<string, LoadedControllerContext>>();
  private readonly roots: string[];
  private readonly resolved: boolean;

  constructor(contexts: LoadedControllerContext[], workspaces?: TemplateContextWorkspace[]) {
    this.resolved = workspaces !== undefined;
    if (workspaces) {
      this.roots = workspaces.map((workspace) => workspace.rootUri.replace(/\/$/, "")).sort((a, b) => b.length - a.length);
      for (const workspace of workspaces) {
        const root = workspace.rootUri.replace(/\/$/, "");
        const files = [...new Set(workspace.templates.filter((file) => validTemplatePath(file)
          && this.roots.find((candidate) => `${root}/${file.split("/").map(encodeURIComponent).join("/")}`.startsWith(`${candidate}/`)) === root))];
        const aliases = new Map<string, string>();
        const roots = workspace.roots?.length ? workspace.roots : DEFAULT_TEMPLATE_ROOTS;
        // Sort once per root/namespace, rather than scanning and sorting all files
        // for every Controller context or every editor query.
        for (const file of sortWorkspaceTemplatePaths(files, roots)) {
          for (const alias of collectTemplateReferenceAliases(file, undefined, "", roots)) {
            if (!aliases.has(alias.toLowerCase())) aliases.set(alias.toLowerCase(), file);
          }
        }
        for (const [namespace, namespaceRoots] of Object.entries(workspace.namespaces ?? {})) {
          for (const file of sortWorkspaceTemplatePaths(files, namespaceRoots)) {
            const relative = mapWorkspaceTemplateToReferenceWithRoots(file, namespaceRoots);
            if (relative === file) continue;
            const alias = `@${namespace}/${relative}`.toLowerCase();
            if (!aliases.has(alias)) aliases.set(alias, file);
          }
        }
        const available = new Set(files);
        const resolved = contexts.filter((context) => context.projectRootUri.replace(/\/$/, "") === root).flatMap((context) => {
          const template = context.template.replaceAll("\\", "/").replace(/^\.\//, "");
          if (!validTemplatePath(template)) return [];
          const file = available.has(template) ? template : aliases.get(template.toLowerCase());
          return file ? [{ ...context, projectRootUri: root, template: file }] : [];
        });
        this.byRoot.set(root, new Map(mergeProjectContexts(resolved).map((context) => [context.template, context])));
      }
      return;
    }
    for (const context of contexts) {
      const template = context.template.replaceAll("\\", "/").replace(/^\.\//, "");
      if (!template || template.startsWith("/") || template.split("/").includes("..")) continue;
      const root = context.projectRootUri;
      const entries = this.byRoot.get(root) ?? new Map<string, LoadedControllerContext>();
      entries.set(template, context);
      this.byRoot.set(root, entries);
    }
    this.roots = [...this.byRoot.keys()].sort((a, b) => b.length - a.length);
  }

  get(uri: string): LoadedControllerContext | undefined {
    const root = this.roots.find((candidate) => uri.startsWith(candidate.endsWith("/") ? candidate : `${candidate}/`));
    if (!root) return undefined;
    let relative: string;
    try { relative = decodeURIComponent(uri.slice(root.length + (root.endsWith("/") ? 0 : 1))); }
    catch { return undefined; }
    const entries = this.byRoot.get(root)!;
    if (this.resolved) return entries.get(relative);
    let suffix = relative;
    while (suffix) {
      const context = entries.get(suffix);
      if (context) return context;
      const separator = suffix.indexOf("/");
      if (separator < 0) break;
      suffix = suffix.slice(separator + 1);
    }
    return undefined;
  }
}

export function changedContextDocuments(previous: ProjectContextIndex, current: ProjectContextIndex,
  projectRootUri: string, documentUris: string[], typesChanged: boolean): string[] {
  const rootPrefix = projectRootUri.endsWith("/") ? projectRootUri : `${projectRootUri}/`;
  return documentUris.filter((uri) => {
    if (!uri.startsWith(rootPrefix)) return false;
    const before = previous.get(uri);
    const after = current.get(uri);
    return JSON.stringify(before) !== JSON.stringify(after) || (!after && typesChanged);
  });
}

function mergeTypeNames(types: string[]): string {
  if (!types.length || types.includes("mixed")) return "mixed";
  const unique = [...new Set(types.flatMap((type) => type.split("|")).map((type) => type.trim()).filter(Boolean))];
  return unique.length ? unique.join("|") : "mixed";
}

/** Merge only contexts belonging to the same workspace root and template. */
export function mergeProjectContexts(contexts: LoadedControllerContext[]): LoadedControllerContext[] {
  const groups = new Map<string, LoadedControllerContext[]>();
  for (const context of contexts) {
    const key = `${context.projectRootUri}\0${context.template.replaceAll("\\", "/")}`;
    groups.set(key, [...(groups.get(key) ?? []), context]);
  }
  return [...groups.values()].map((entries) => {
    const names = [...new Set(entries.flatMap((entry) => Object.keys(entry.variables)))].sort();
    const variables = Object.fromEntries(names.map((name) => [name, mergeTypeNames(entries.flatMap((entry) => name in entry.variables ? [entry.variables[name]!] : []))]));
    const optionalVariables = names.filter((name) => entries.some((entry) => !Object.hasOwn(entry.variables, name) || entry.optionalVariables?.includes(name)));
    const variableSources = Object.fromEntries(names.flatMap((name) => {
      const sources = [...new Map(entries.flatMap((entry) => entry.variableSources?.[name] ?? []).map((source) => [`${source.uri}:${source.line}:${source.character}`, source])).values()];
      return sources.length ? [[name, sources] as const] : [];
    }));
    const sources = [...new Map(entries.flatMap((entry) => entry.sources).map((source) => [`${source.controller}:${source.uri}:${source.line}:${source.character}`, source])).values()];
    const types = Object.assign({}, ...entries.map((entry) => entry.types ?? {}));
    return { projectRootUri: entries[0]!.projectRootUri, template: entries[0]!.template, complete: entries.every((entry) => entry.complete), variables,
      ...(optionalVariables.length ? { optionalVariables } : {}), ...(Object.keys(variableSources).length ? { variableSources } : {}), sources, types };
  });
}

function validTemplatePath(template: string): boolean {
  return Boolean(template) && !template.startsWith("/") && !template.split("/").includes("..");
}
