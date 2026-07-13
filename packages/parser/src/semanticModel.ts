import { parseHybridDocument, type HybridDocument, type TwigNode } from "./hybridAst";
import { getTwigCallable, TWIG_3_SPEC } from "@twig-plus/language-spec";
import { visitTwigExpression, type TwigExpression } from "./twigAst";
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
  role: "variable-read" | "function-call" | "filter" | "test" | "member" | "named-argument" | "template" | "operator";
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
  kind: "document" | "block" | "loop" | "macro" | "with" | "condition" | "arrow";
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
  unresolvedNameMode?: "safe" | "strict" | "off";
  globals?: string[];
  contextComplete?: boolean;
  catalogComplete?: boolean;
}

export function parseDocument(source: string): HybridDocument { return parseHybridDocument(source); }
export function printCst(document: HybridDocument): string { return document.source; }

export function createDocumentModel(document: HybridDocument, options: DocumentModelOptions = {}): DocumentModel {
  const root: SemanticScope = { id: "scope:document", kind: "document", start: 0, end: document.end, symbols: [] };
  const scopes: SemanticScope[] = [root];
  for (const pair of document.twigControlBlocks) {
    const open = document.children.find((node) => node.start === pair.openStart);
    if (!(open && "tagName" in open) || !["block", "for", "macro", "with", "if"].includes(open.tagName ?? "")) continue;
    const branchStart = ["for", "if"].includes(open.tagName ?? "") ? findStructure(document.structure, pair.openStart)?.branches[0]?.markerStart : undefined;
    const kind = open.tagName === "for" ? "loop" : open.tagName === "if" ? "condition" : open.tagName as "block" | "macro" | "with";
    scopes.push({ id: `scope:${pair.openStart}`, kind, start: pair.openEnd, end: branchStart ?? pair.closeStart, parentId: root.id, symbols: [] });
  }
  for (const scope of scopes.slice(1)) {
    const parent = scopes.filter((candidate) => candidate.id !== scope.id && candidate.start <= scope.start && candidate.end >= scope.end).sort((a, b) => (a.end - a.start) - (b.end - b.start))[0];
    scope.parentId = parent?.id ?? root.id;
  }

  const symbols: SemanticSymbol[] = [];
  const references: SemanticReference[] = [];
  const diagnostics: SemanticDiagnostic[] = [];
  const templateRelations: TemplateRelation[] = [];
  const globals = new Set([...TWIG_3_SPEC.globals, ...(options.globals ?? [])]);
  const unresolvedMode = options.unresolvedNameMode ?? (options.diagnoseUnresolvedNames ? "strict" : "off");
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
    if (node.statement?.name === "if" && expressions[0]) {
      const target = scopes.find((item) => item.start === node.end && item.kind === "condition");
      if (target) for (const narrowing of collectDefinedNarrowings(expressions[0])) addSymbol(narrowing.name, "variable", narrowing, target);
    }
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
    else if (isCatalogReference(reference) && getTwigCallable(reference.role === "function-call" ? "function" : reference.role, reference.name)) continue;
    else if (shouldReportUnresolved(reference, unresolvedMode, globals, options)) diagnostics.push({ code: "unresolved-name", severity: "warning", message: `Unresolved ${referenceLabel(reference.role)} '${reference.name}'.`, start: reference.start, end: reference.end });
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

function collectExpressionReferences(expression: TwigExpression, scopeAt: (offset: number) => string, references: SemanticReference[], undefinedSafe = false): void {
  const add = (node: SourceRange, name: string, role: SemanticReference["role"], qualifier?: string) => {
    if (name) references.push({ name, role, scopeId: scopeAt(node.start), start: node.start, end: node.end, qualifier });
  };
  switch (expression.kind) {
    case "NameExpression":
      if (!undefinedSafe) add(expression, expression.name, "variable-read");
      return;
    case "LiteralExpression": case "MissingExpression": case "ErrorExpression": return;
    case "UnaryExpression": collectExpressionReferences(expression.operand, scopeAt, references, undefinedSafe); return;
    case "BinaryExpression":
      collectExpressionReferences(expression.left, scopeAt, references, expression.operator === "??" || undefinedSafe);
      collectExpressionReferences(expression.right, scopeAt, references, undefinedSafe);
      return;
    case "MemberExpression":
      collectExpressionReferences(expression.object, scopeAt, references, undefinedSafe);
      if (expression.computed) collectExpressionReferences(expression.property, scopeAt, references, undefinedSafe);
      else if (expression.property.kind === "NameExpression") add(expression.property, expression.property.name, "member");
      return;
    case "CallExpression":
      if (expression.callee.kind === "NameExpression") add(expression.callee, expression.callee.name, "function-call");
      else if (expression.callee.kind === "MemberExpression" && !expression.callee.computed && expression.callee.property.kind === "NameExpression") {
        collectExpressionReferences(expression.callee.object, scopeAt, references, undefinedSafe);
        add(expression.callee.property, expression.callee.property.name, "function-call", expression.callee.object.kind === "NameExpression" ? expression.callee.object.name : undefined);
      }
      else collectExpressionReferences(expression.callee, scopeAt, references, undefinedSafe);
      expression.arguments.forEach((argument) => collectExpressionReferences(argument, scopeAt, references));
      return;
    case "FilterExpression": {
      const safe = getTwigCallable("filter", expression.filter.name)?.allowsUndefinedInput ?? false;
      collectExpressionReferences(expression.input, scopeAt, references, safe || undefinedSafe);
      add(expression.filter, expression.filter.name, "filter");
      expression.arguments.forEach((argument) => collectExpressionReferences(argument, scopeAt, references));
      return;
    }
    case "TestExpression": {
      const safe = getTwigCallable("test", expression.test.name)?.allowsUndefinedInput ?? false;
      collectExpressionReferences(expression.input, scopeAt, references, safe || undefinedSafe);
      add(expression.test, expression.test.name, "test");
      expression.arguments.forEach((argument) => collectExpressionReferences(argument, scopeAt, references));
      return;
    }
    case "ArrayExpression": case "MapExpression":
      for (const item of expression.items) {
        if ("key" in item) {
          if (item.key.kind !== "NameExpression") collectExpressionReferences(item.key, scopeAt, references);
          collectExpressionReferences(item.value, scopeAt, references);
        } else collectExpressionReferences(item, scopeAt, references);
      }
      return;
    case "ConditionalExpression":
      collectExpressionReferences(expression.test, scopeAt, references);
      collectExpressionReferences(expression.consequent, scopeAt, references);
      collectExpressionReferences(expression.alternate, scopeAt, references);
      return;
    case "NamedArgumentExpression":
      add(expression.name, expression.name.name, "named-argument");
      collectExpressionReferences(expression.value, scopeAt, references);
      return;
    case "ArrowFunctionExpression": collectExpressionReferences(expression.body, scopeAt, references); return;
    case "ParenthesizedExpression": collectExpressionReferences(expression.expression, scopeAt, references, undefinedSafe); return;
    case "SpreadExpression": collectExpressionReferences(expression.expression, scopeAt, references, undefinedSafe); return;
  }
}

function isCatalogReference(reference: SemanticReference): reference is SemanticReference & { role: "function-call" | "filter" | "test" } {
  return reference.role === "function-call" || reference.role === "filter" || reference.role === "test";
}
function shouldReportUnresolved(reference: SemanticReference, mode: "safe" | "strict" | "off", globals: Set<string>, options: DocumentModelOptions): boolean {
  if (mode === "off" || reference.role === "template" || reference.role === "member" || reference.role === "named-argument" || reference.role === "operator" || globals.has(reference.name)) return false;
  if (mode === "strict") return true;
  return reference.role === "variable-read" ? options.contextComplete === true : options.catalogComplete === true;
}
function referenceLabel(role: SemanticReference["role"]): string {
  return ({ "variable-read": "name", "function-call": "function", filter: "filter", test: "test" } as Partial<Record<SemanticReference["role"], string>>)[role] ?? "name";
}

function collectDefinedNarrowings(expression: TwigExpression): Array<SourceRange & { name: string }> {
  if (expression.kind === "ParenthesizedExpression") return collectDefinedNarrowings(expression.expression);
  if (expression.kind === "BinaryExpression" && expression.operator === "and") return [...collectDefinedNarrowings(expression.left), ...collectDefinedNarrowings(expression.right)];
  if (expression.kind !== "TestExpression" || expression.negated || expression.test.name !== "defined") return [];
  let input = expression.input;
  while (input.kind === "MemberExpression") input = input.object;
  return input.kind === "NameExpression" ? [{ name: input.name, start: input.start, end: input.end }] : [];
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
