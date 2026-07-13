export type ProjectCompletionKind = "tag" | "filter" | "function" | "test" | "global" | "route" | "translation" | "asset";

export interface ProjectCompletionEntry {
  kind: ProjectCompletionKind;
  name: string;
  detail?: string;
  documentation?: string;
  signature?: string;
}

export interface ProjectMetadataSnapshot {
  providerId: string;
  projectRoot: string;
  generatedAt: number;
  completions: ProjectCompletionEntry[];
  templates: string[];
  blocks: Array<{ template: string; name: string }>;
  macros: Array<{ template: string; name: string; parameters: string[] }>;
}

/** Optional framework adapter. Generic Twig parsing and formatting never depend on a provider. */
export interface ProjectMetadataProvider {
  readonly id: string;
  supports(projectRoot: string): Promise<boolean>;
  load(projectRoot: string, signal?: AbortSignal): Promise<ProjectMetadataSnapshot>;
}

export function emptyProjectMetadata(providerId: string, projectRoot: string): ProjectMetadataSnapshot {
  return { providerId, projectRoot, generatedAt: Date.now(), completions: [], templates: [], blocks: [], macros: [] };
}
