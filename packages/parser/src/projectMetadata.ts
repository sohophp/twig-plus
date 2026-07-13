export type ProjectCompletionKind = "tag" | "filter" | "function" | "test" | "global" | "route" | "translation" | "asset";

export interface ProjectCompletionEntry {
  kind: ProjectCompletionKind;
  name: string;
  detail?: string;
  documentation?: string;
  signature?: string;
}

export interface ProjectMetadataSnapshot {
  schemaVersion?: 1 | 2;
  providerId: string;
  projectRoot: string;
  generatedAt: number;
  environment?: {
    twigVersion?: string;
    packages?: string[];
    catalogComplete?: boolean;
  };
  completions: ProjectCompletionEntry[];
  symbols?: {
    globals?: ProjectCompletionEntry[];
    functions?: ProjectCompletionEntry[];
    filters?: ProjectCompletionEntry[];
    tests?: ProjectCompletionEntry[];
    tags?: ProjectCompletionEntry[];
  };
  contexts?: Array<{ template: string; complete: boolean; variables: string[] }>;
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
  return { schemaVersion: 2, providerId, projectRoot, generatedAt: Date.now(), completions: [], templates: [], blocks: [], macros: [] };
}
