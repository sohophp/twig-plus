export interface LoadedControllerSource { controller: string; uri: string; line: number; character: number; }
export interface LoadedControllerVariableSource { uri: string; line: number; character: number; }
export interface LoadedControllerContext {
  projectRootUri: string;
  template: string;
  complete: boolean;
  variables: Record<string, string>;
  variableSources?: Record<string, LoadedControllerVariableSource[]>;
  sources: LoadedControllerSource[];
  types?: Record<string, { name: string; members: Array<{ name: string; kind: "property" | "method"; type?: string; signature?: string; documentation?: string; sources?: Array<{ uri: string; line: number; character: number }> }> }>;
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
    const variableSources = Object.fromEntries(names.flatMap((name) => {
      const sources = [...new Map(entries.flatMap((entry) => entry.variableSources?.[name] ?? []).map((source) => [`${source.uri}:${source.line}:${source.character}`, source])).values()];
      return sources.length ? [[name, sources] as const] : [];
    }));
    const sources = [...new Map(entries.flatMap((entry) => entry.sources).map((source) => [`${source.controller}:${source.uri}:${source.line}:${source.character}`, source])).values()];
    const types = Object.assign({}, ...entries.map((entry) => entry.types ?? {}));
    return { projectRootUri: entries[0]!.projectRootUri, template: entries[0]!.template, complete: entries.every((entry) => entry.complete), variables, ...(Object.keys(variableSources).length ? { variableSources } : {}), sources, types };
  });
}
