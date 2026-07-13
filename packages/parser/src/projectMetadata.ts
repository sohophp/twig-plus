export type ProjectCompletionKind = "tag" | "filter" | "function" | "test" | "global" | "route" | "translation" | "asset" | "form" | "security" | "fragment" | "importmap";

export interface ProjectReferenceEntry extends ProjectCompletionEntry {
  source?: { path: string; line?: number; character?: number };
}

export interface ProjectCompletionEntry {
  kind: ProjectCompletionKind;
  name: string;
  detail?: string;
  documentation?: string;
  signature?: string;
}

export interface ProjectMetadataSnapshot {
  schemaVersion?: 1 | 2 | 3;
  providerId: string;
  projectRoot: string;
  generatedAt: number;
  environment?: {
    twigVersion?: string;
    symfonyVersion?: string;
    packages?: string[];
    packageVersions?: Record<string, string>;
    catalogComplete?: boolean;
    referenceCatalogsComplete?: Array<"route" | "asset" | "translation" | "form" | "security" | "fragment" | "importmap">;
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
  references?: {
    routes?: ProjectReferenceEntry[];
    translations?: ProjectReferenceEntry[];
    assets?: ProjectReferenceEntry[];
    forms?: ProjectReferenceEntry[];
    security?: ProjectReferenceEntry[];
    fragments?: ProjectReferenceEntry[];
    importmaps?: ProjectReferenceEntry[];
  };
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
  return { schemaVersion: 3, providerId, projectRoot, generatedAt: Date.now(), completions: [], templates: [], blocks: [], macros: [], references: {} };
}
