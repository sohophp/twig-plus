import { createDocumentModel, parseDocument, type DocumentModel, type SemanticReference, type SemanticSymbol } from "./semanticModel";

export interface WorkspaceDocument { uri: string; source: string; }
export interface WorkspaceLocation { uri: string; start: number; end: number; }
export type TemplateUriResolver = (fromUri: string, templateReference: string) => string | null;

export interface WorkspaceModel {
  documents: Map<string, DocumentModel>;
  getDocument(uri: string): DocumentModel | null;
  getDefinition(uri: string, offset: number): WorkspaceLocation | null;
  findReferences(uri: string, offset: number, includeDeclaration?: boolean): WorkspaceLocation[];
  findReferencesAsync(uri: string, offset: number, includeDeclaration?: boolean, isCancelled?: () => boolean): Promise<WorkspaceLocation[]>;
}

export function createWorkspaceModel(inputs: WorkspaceDocument[], resolveTemplate: TemplateUriResolver): WorkspaceModel {
  const sources = new Map(inputs.map((input) => [input.uri, input.source]));
  const documents = new Map<string, DocumentModel>();
  const getDocument = (uri: string): DocumentModel | null => {
    const cached = documents.get(uri); if (cached) return cached;
    const source = sources.get(uri); if (source === undefined) return null;
    const model = createDocumentModel(parseDocument(source)); documents.set(uri, model); return model;
  };

  const localTarget = (uri: string, offset: number): SemanticSymbol | null => {
    const model = getDocument(uri); if (!model) return null;
    const direct = model.getSymbolAt(offset); if (direct) return direct;
    const reference = model.getReferenceAt(offset);
    if (reference?.resolvedSymbolId) return model.symbols.find((symbol) => symbol.id === reference.resolvedSymbolId) ?? null;
    return resolveCrossFileCall(uri, model, reference ?? null, getDocument, resolveTemplate)?.symbol ?? null;
  };

  const getDefinition = (uri: string, offset: number): WorkspaceLocation | null => {
    const model = getDocument(uri); if (!model) return null;
    const direct = model.getSymbolAt(offset);
    if (direct?.kind === "block") {
      const parent = model.templateRelations.find((relation) => relation.kind === "extends" && relation.template);
      const parentUri = parent?.template ? resolveTemplate(uri, parent.template) : null;
      const parentBlock = parentUri ? getDocument(parentUri)?.symbols.find((symbol) => symbol.kind === "block" && symbol.name === direct.name) : null;
      if (parentUri && parentBlock) return location(parentUri, parentBlock.nameRange);
    }
    const reference = model.getReferenceAt(offset);
    if (reference?.role === "template" && !reference.dynamic) {
      const targetUri = resolveTemplate(uri, reference.name);
      if (targetUri && sources.has(targetUri)) return { uri: targetUri, start: 0, end: 0 };
    }
    const cross = resolveCrossFileCall(uri, model, reference, getDocument, resolveTemplate);
    if (cross) return location(cross.uri, cross.symbol);
    const symbol = localTarget(uri, offset);
    return symbol ? location(uri, symbol.nameRange) : null;
  };

  const findReferences = (uri: string, offset: number, includeDeclaration = false): WorkspaceLocation[] => {
    const origin = getDocument(uri); if (!origin) return [];
    const reference = origin.getReferenceAt(offset);
    const cross = resolveCrossFileCall(uri, origin, reference, getDocument, resolveTemplate);
    const symbol = cross?.symbol ?? localTarget(uri, offset); if (!symbol) return [];
    const declarationUri = cross?.uri ?? uri;
    const results: WorkspaceLocation[] = includeDeclaration ? [location(declarationUri, symbol.nameRange)] : [];
    for (const candidateUri of sources.keys()) {
      const model = getDocument(candidateUri); if (!model) continue;
      for (const candidate of model.references) {
        if (candidateUri === declarationUri && candidate.resolvedSymbolId === symbol.id) results.push(location(candidateUri, candidate));
        const resolved = resolveCrossFileCall(candidateUri, model, candidate, getDocument, resolveTemplate);
        if (resolved?.uri === declarationUri && resolved.symbol.id === symbol.id) results.push(location(candidateUri, candidate));
      }
    }
    return deduplicate(results);
  };

  const findReferencesAsync = async (uri: string, offset: number, includeDeclaration = false, isCancelled = () => false): Promise<WorkspaceLocation[]> => {
    const origin = getDocument(uri); if (!origin) return [];
    const reference = origin.getReferenceAt(offset);
    const cross = resolveCrossFileCall(uri, origin, reference, getDocument, resolveTemplate);
    const symbol = cross?.symbol ?? localTarget(uri, offset); if (!symbol) return [];
    const declarationUri = cross?.uri ?? uri;
    const results: WorkspaceLocation[] = includeDeclaration ? [location(declarationUri, symbol.nameRange)] : [];
    let index = 0;
    for (const candidateUri of sources.keys()) {
      if (isCancelled()) return [];
      if (++index % 50 === 0) await yieldToEventLoop();
      if (!sources.get(candidateUri)?.includes(symbol.name)) continue;
      const model = getDocument(candidateUri); if (!model) continue;
      for (const candidate of model.references) {
        if (candidateUri === declarationUri && candidate.resolvedSymbolId === symbol.id) results.push(location(candidateUri, candidate));
        const resolved = resolveCrossFileCall(candidateUri, model, candidate, getDocument, resolveTemplate);
        if (resolved?.uri === declarationUri && resolved.symbol.id === symbol.id) results.push(location(candidateUri, candidate));
      }
    }
    return deduplicate(results);
  };

  return { documents, getDocument, getDefinition, findReferences, findReferencesAsync };
}

function resolveCrossFileCall(
  uri: string, model: DocumentModel, reference: SemanticReference | null,
  getDocument: (uri: string) => DocumentModel | null, resolver: TemplateUriResolver
): { uri: string; symbol: SemanticSymbol } | null {
  if (!reference || reference.role !== "function-call") return null;
  let template: string | null = null;
  let exportedName = reference.name;
  if (reference.qualifier) {
    if (reference.qualifier === "_self") {
      const symbol = model.symbols.find((item) => item.kind === "macro" && item.name === reference.name);
      return symbol ? { uri, symbol } : null;
    }
    const relation = model.templateRelations.find((item) => item.kind === "import" && item.alias === reference.qualifier);
    template = relation?.template ?? null;
  } else {
    const relation = model.templateRelations.find((item) => item.kind === "from" && item.imports?.some((entry) => entry.localName === reference.name));
    template = relation?.template ?? null;
    exportedName = relation?.imports?.find((entry) => entry.localName === reference.name)?.exportedName ?? reference.name;
  }
  if (!template) return null;
  const targetUri = resolver(uri, template); if (!targetUri) return null;
  const symbol = getDocument(targetUri)?.symbols.find((item) => item.kind === "macro" && item.name === exportedName);
  return symbol ? { uri: targetUri, symbol } : null;
}

function location(uri: string, range: { start: number; end: number }): WorkspaceLocation { return { uri, start: range.start, end: range.end }; }
function deduplicate(locations: WorkspaceLocation[]): WorkspaceLocation[] {
  const seen = new Set<string>();
  return locations.filter((item) => { const key = `${item.uri}:${item.start}:${item.end}`; if (seen.has(key)) return false; seen.add(key); return true; });
}
function yieldToEventLoop(): Promise<void> { return new Promise((resolve) => setImmediate(resolve)); }
