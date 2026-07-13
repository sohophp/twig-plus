import { parseHybridDocument, type HybridDocument, type TwigNode } from "./hybridAst";
import { visitTwigExpression, type NameExpression, type TwigExpression } from "./twigAst";
import type { SourceRange } from "./selectionRanges";

export type SemanticSymbolKind = "variable" | "parameter" | "macro" | "block" | "import";
export interface SemanticSymbol extends SourceRange {
  id: string;
  name: string;
  kind: SemanticSymbolKind;
  scopeId: string;
  nameRange: SourceRange;
  parameters?: string[];
}
export interface SemanticReference extends SourceRange {
  name: string;
  scopeId: string;
  role: "read" | "call" | "template";
  resolvedSymbolId?: string;
  dynamic?: boolean;
  qualifier?: string;
}
export interface TemplateRelation extends SourceRange {
  kind: "extends" | "include" | "embed" | "import" | "from";
  template: string | null;
  dynamic: boolean;
  alias?: string;
  imports?: Array<{ exportedName: string; localName: string }>;
}
export interface SemanticScope extends SourceRange {
  id: string;
  kind: "document" | "block" | "loop" | "macro" | "with" | "arrow";
  parentId?: string;
  symbols: SemanticSymbol[];
}
export interface SemanticDiagnostic extends SourceRange {
  code: "duplicate-symbol" | "unresolved-name";
  severity: "error" | "warning" | "information";
  message: string;
}
export interface DocumentModel {
  document: HybridDocument;
  scopes: SemanticScope[];
  symbols: SemanticSymbol[];
  references: SemanticReference[];
  diagnostics: SemanticDiagnostic[];
  templateRelations: TemplateRelation[];
  getScopeAt(offset: number): SemanticScope;
  getVisibleSymbolsAt(offset: number): SemanticSymbol[];
  getSymbolAt(offset: number): SemanticSymbol | null;
  getReferenceAt(offset: number): SemanticReference | null;
  findReferences(symbol: SemanticSymbol): SemanticReference[];
}

export interface DocumentModelOptions {
  /** Report unresolved names. Off by default because globals are supplied by the host application. */
  diagnoseUnresolvedNames?: boolean;
  globals?: string[];
}

export function parseDocument(source: string): HybridDocument { return parseHybridDocument(source); }
export function printCst(document: HybridDocument): string { return document.source; }

export function createDocumentModel(document: HybridDocument, options: DocumentModelOptions = {}): DocumentModel {
  const root: SemanticScope = { id: "scope:document", kind: "document", start: 0, end: document.end, symbols: [] };
  const scopes: SemanticScope[] = [root];
  for (const pair of document.twigControlBlocks) {
    const open = document.children.find((node) => node.start === pair.openStart);
    if (!(open && "tagName" in open) || !["block", "for", "macro", "with"].includes(open.tagName ?? "")) continue;
    const branchStart = open.tagName === "for" ? findStructure(document.structure, pair.openStart)?.branches[0]?.markerStart : undefined;
    scopes.push({ id: `scope:${pair.openStart}`, kind: open.tagName === "for" ? "loop" : open.tagName as "block" | "macro" | "with", start: pair.openEnd, end: branchStart ?? pair.closeStart, parentId: root.id, symbols: [] });
  }
  for (const scope of scopes.slice(1)) {
    const parent = scopes.filter((candidate) => candidate.id !== scope.id && candidate.start <= scope.start && candidate.end >= scope.end).sort((a, b) => (a.end - a.start) - (b.end - b.start))[0];
    scope.parentId = parent?.id ?? root.id;
  }

  const symbols: SemanticSymbol[] = [];
  const references: SemanticReference[] = [];
  const diagnostics: SemanticDiagnostic[] = [];
  const templateRelations: TemplateRelation[] = [];
  const globals = new Set(options.globals ?? []);
  const scopeAt = (offset: number) => scopes.filter((scope) => scope.start <= offset && scope.end >= offset).sort((a, b) => (a.end - a.start) - (b.end - b.start))[0] ?? root;
  const addSymbol = (name: string, kind: SemanticSymbolKind, range: SourceRange, targetScope: SemanticScope) => {
    const duplicate = targetScope.symbols.find((item) => item.name === name);
    const symbol: SemanticSymbol = { id: `${kind}:${range.start}:${name}`, name, kind, scopeId: targetScope.id, start: range.start, end: range.end, nameRange: range };
    targetScope.symbols.push(symbol); symbols.push(symbol);
    if (duplicate && kind !== "variable") diagnostics.push({ code: "duplicate-symbol", severity: "warning", message: `Duplicate ${kind} '${name}'.`, ...range });
  };

  for (const node of document.children) {
    if (!(node.kind === "TwigTag" || node.kind === "TwigOutput" || (node.kind === "IncompleteNode" && "inner" in node))) continue;
    const scope = scopeAt(node.start);
    if (node.statement) collectStatementSymbols(node, scope, scopes, addSymbol, references, templateRelations);
    const expressions = [node.expression, ...(node.statement?.arguments ?? [])].filter((item): item is TwigExpression => Boolean(item));
    for (const expression of expressions) registerArrowScopes(expression, scopeAt, scopes, addSymbol);
    for (const expression of expressions) collectExpressionReferences(expression, (offset) => scopeAt(offset).id, references);
  }

  const parents = new Map(scopes.map((scope) => [scope.id, scope]));
  const visible = (scope: SemanticScope, offset: number): SemanticSymbol[] => {
    const result: SemanticSymbol[] = []; let current: SemanticScope | undefined = scope;
    while (current) {
      result.push(...current.symbols.filter((symbol) => symbol.kind === "macro" || symbol.kind === "block" || symbol.nameRange.start <= offset).sort((left, right) => right.nameRange.start - left.nameRange.start));
      current = current.parentId ? parents.get(current.parentId) : undefined;
    }
    return result;
  };
  for (const reference of references) {
    const target = visible(parents.get(reference.scopeId) ?? root, reference.start).find((symbol) => symbol.name === reference.name);
    if (target) reference.resolvedSymbolId = target.id;
    else if (options.diagnoseUnresolvedNames && reference.role !== "template" && !globals.has(reference.name)) diagnostics.push({ code: "unresolved-name", severity: "warning", message: `Unresolved name '${reference.name}'.`, start: reference.start, end: reference.end });
  }
  for (const symbol of symbols.filter((item) => item.kind === "macro")) {
    const macroScope = scopes.filter((scope) => scope.kind === "macro" && scope.start >= symbol.end).sort((a, b) => a.start - b.start)[0];
    symbol.parameters = macroScope?.symbols.filter((item) => item.kind === "parameter").map((item) => item.name) ?? [];
  }

  return {
    document, scopes, symbols, references, diagnostics, templateRelations,
    getScopeAt: scopeAt,
    getVisibleSymbolsAt(offset) { return visible(scopeAt(offset), offset).filter((symbol, index, all) => all.findIndex((item) => item.name === symbol.name) === index); },
    getSymbolAt(offset) { return symbols.find((symbol) => offset >= symbol.nameRange.start && offset <= symbol.nameRange.end) ?? null; },
    getReferenceAt(offset) { return references.find((reference) => offset >= reference.start && offset <= reference.end) ?? null; },
    findReferences(symbol) { return references.filter((reference) => reference.resolvedSymbolId === symbol.id); }
  };
}

function findStructure(nodes: HybridDocument["structure"], openStart: number): HybridDocument["structure"][number] | null {
  for (const node of nodes) {
    if (node.openStart === openStart && node.kind === "TwigControlBlock") return node;
    const nested = findStructure(node.children, openStart); if (nested) return nested;
  }
  return null;
}

function collectStatementSymbols(
  node: TwigNode, scope: SemanticScope, scopes: SemanticScope[],
  add: (name: string, kind: SemanticSymbolKind, range: SourceRange, scope: SemanticScope) => void,
  references: SemanticReference[], relations: TemplateRelation[]
): void {
  const tokens = node.statement?.tokens.filter((token) => token.kind !== "whitespace" && token.kind !== "eof") ?? [];
  const name = node.statement?.name;
  const ownScope = scopes.find((item) => item.start === node.end) ?? scope;
  for (const binding of node.statement?.bindings ?? []) {
    const target = binding.role === "variable" && (name === "for" || name === "with") || binding.role === "parameter" ? ownScope : scope;
    add(binding.name, binding.role, binding, target);
  }
  if (["extends", "include", "embed", "import", "from"].includes(name ?? "")) {
    const template = tokens.find((token) => token.kind === "string");
    if (template) references.push({ name: template.value.slice(1, template.complete ? -1 : undefined), role: "template", scopeId: scope.id, start: template.start, end: template.end, dynamic: false });
    else if (tokens[1]) references.push({ name: tokens[1].value, role: "template", scopeId: scope.id, start: tokens[1].start, end: tokens[1].end, dynamic: true });
    const templateValue = template ? template.value.slice(1, template.complete ? -1 : undefined) : null;
    const relation: TemplateRelation = {
      kind: name as TemplateRelation["kind"], template: templateValue, dynamic: !template,
      start: template?.start ?? tokens[1]?.start ?? node.start, end: template?.end ?? tokens[1]?.end ?? node.end
    };
    if (name === "import") {
      relation.alias = node.statement?.bindings.find((binding) => binding.role === "import")?.name;
    } else if (name === "from") {
      const importIndex = tokens.findIndex((token) => token.value === "import");
      relation.imports = [];
      for (let index = importIndex + 1; index < tokens.length; index += 1) {
        const exported = tokens[index];
        if (exported.kind !== "name" || exported.value === "as" || tokens[index - 1]?.value === "as") continue;
        const local = tokens[index + 1]?.value === "as" && tokens[index + 2]?.kind === "name" ? tokens[index + 2].value : exported.value;
        relation.imports.push({ exportedName: exported.value, localName: local });
      }
    }
    relations.push(relation);
  }
}

function collectExpressionReferences(expression: TwigExpression, scopeAt: (offset: number) => string, references: SemanticReference[], excluded: SourceRange[] = []): void {
  const calls = new Map<TwigExpression, { name: string; qualifier?: string }>();
  visitTwigExpression(expression, (node) => {
    if (node.kind !== "CallExpression") return;
    if (node.callee.kind === "NameExpression") calls.set(node.callee, { name: node.callee.name });
    else if (node.callee.kind === "MemberExpression" && !node.callee.computed && node.callee.object.kind === "NameExpression" && node.callee.property.kind === "NameExpression") {
      calls.set(node.callee.property, { name: node.callee.property.name, qualifier: node.callee.object.name });
    }
  });
  visitTwigExpression(expression, (node) => {
    if (node.kind !== "NameExpression" || !node.name || excluded.some((range) => node.start === range.start && node.end === range.end)) return;
    const call = calls.get(node);
    const scopeId = scopeAt(node.start);
    if (call) references.push({ ...call, role: "call", scopeId, start: node.start, end: node.end });
    else if (!isMemberProperty(expression, node) && !isNamedArgumentName(expression, node) && !isMapKey(expression, node) && !isArrowParameter(expression, node)) references.push({ name: node.name, role: "read", scopeId, start: node.start, end: node.end });
  });
}

function isMemberProperty(root: TwigExpression, target: NameExpression): boolean {
  let property = false;
  visitTwigExpression(root, (node) => { if (node.kind === "MemberExpression" && !node.computed && node.property === target) property = true; });
  return property;
}

function isNamedArgumentName(root: TwigExpression, target: NameExpression): boolean {
  let named = false;
  visitTwigExpression(root, (node) => { if (node.kind === "NamedArgumentExpression" && node.name === target) named = true; });
  return named;
}

function isMapKey(root: TwigExpression, target: NameExpression): boolean {
  let key = false;
  visitTwigExpression(root, (node) => {
    if (node.kind === "MapExpression" && node.items.some((item) => "key" in item && item.key === target)) key = true;
  });
  return key;
}

function isArrowParameter(root: TwigExpression, target: NameExpression): boolean {
  let parameter = false;
  visitTwigExpression(root, (node) => { if (node.kind === "ArrowFunctionExpression" && node.parameters.includes(target)) parameter = true; });
  return parameter;
}

function registerArrowScopes(
  expression: TwigExpression,
  scopeAt: (offset: number) => SemanticScope,
  scopes: SemanticScope[],
  add: (name: string, kind: SemanticSymbolKind, range: SourceRange, scope: SemanticScope) => void
): void {
  visitTwigExpression(expression, (node) => {
    if (node.kind !== "ArrowFunctionExpression") return;
    const scope: SemanticScope = {
      id: `scope:arrow:${node.start}`, kind: "arrow", start: node.body.start, end: node.body.end,
      parentId: scopeAt(node.start).id, symbols: []
    };
    scopes.push(scope);
    for (const parameter of node.parameters) add(parameter.name, "parameter", parameter, scope);
  });
}
