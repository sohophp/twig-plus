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
  type?: string;
  returnType?: string;
}

export interface ProjectTypeMember { name: string; kind: "property" | "method"; type?: string; signature?: string; documentation?: string; }
export interface ProjectTypeEntry { name: string; members: ProjectTypeMember[]; }

export interface ProjectMetadataSnapshot {
  schemaVersion?: 1 | 2 | 3 | 4;
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
  types?: Record<string, ProjectTypeEntry>;
  contexts?: Array<{
    template: string;
    complete: boolean;
    variables: string[] | Record<string, string>;
    sources?: Array<{ controller: string; path: string; line?: number }>;
  }>;
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
