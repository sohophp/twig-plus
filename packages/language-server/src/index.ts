import {
  createConnection, ProposedFeatures, TextDocuments, TextDocumentSyncKind,
  CompletionItemKind, DiagnosticSeverity, DocumentSymbol, LSPErrorCodes, ResponseError, SymbolKind,
  type InitializeResult, InsertTextFormat, type Location, type Range, type SelectionRange, TextEdit
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { analyzeHybridDiagnostics, analyzeTwigDiagnostics, collectHybridSelectionRanges, collectTemplateCompletionCandidates, createDocumentModel, createWorkspaceModel, DEFAULT_TEMPLATE_ROOTS, getHybridTokenContextAtOffset, getTemplateReferenceMatch, getTwigDiagnosticCode, parseDocument, resolveTemplateWorkspacePath, type DocumentModel, type ParserEngine, type SemanticSymbol, type TemplateUriResolver } from "@twig-plus/parser";
import { formatTwigWithResult, type FormatterOptions, type FormatterStage } from "@twig-plus/formatter";
import { EmbeddedJavaScriptService } from "./embeddedJavaScript";
import { getTwigCompletions, TwigCompletionRegistry, type ProjectCompletionEntry } from "./twigCompletion";

export interface TwigPlusServerOptions {
  diagnoseUnresolvedNames?: boolean;
  globals?: string[];
  formatter?: Partial<FormatterOptions>;
  resolveTemplate?: TemplateUriResolver;
}
interface TwigPlusSettings {
  format?: Partial<FormatterOptions> & { enable?: boolean };
  parser?: { engine?: ParserEngine };
  templates?: { roots?: string[] };
  diagnostics?: { unresolvedNames?: boolean; globals?: string[] };
}

export function getServerCapabilities(): InitializeResult["capabilities"] {
  return {
    textDocumentSync: TextDocumentSyncKind.Incremental,
    completionProvider: { triggerCharacters: ["%", "{", " ", ".", "|", "(", "\"", "'", "/"] },
    definitionProvider: true, referencesProvider: true, renameProvider: { prepareProvider: true },
    documentSymbolProvider: true, selectionRangeProvider: true, documentFormattingProvider: true
  };
}

interface CachedModel { version: number; model: DocumentModel; }
export const MAX_DOCUMENT_LENGTH = 2_000_000;
export const MAX_INDEXED_FILE_BYTES = 2_000_000;
export const MAX_INDEXED_FILES = 20_000;

function toJavaScriptCompletionKind(kind: string): CompletionItemKind {
  if (kind === "method" || kind === "function") return CompletionItemKind.Function;
  if (kind === "class") return CompletionItemKind.Class;
  if (kind === "interface") return CompletionItemKind.Interface;
  if (kind === "module" || kind === "external module name") return CompletionItemKind.Module;
  if (kind === "property" || kind === "getter" || kind === "setter") return CompletionItemKind.Property;
  if (kind === "const" || kind === "let" || kind === "var") return CompletionItemKind.Variable;
  if (kind === "keyword") return CompletionItemKind.Keyword;
  return CompletionItemKind.Text;
}

export function startLanguageServer(options: TwigPlusServerOptions = {}): void {
  const connection = createConnection(ProposedFeatures.all);
  const documents = new TextDocuments(TextDocument);
  const cache = new Map<string, CachedModel>();
  const embeddedJavaScript = new EmbeddedJavaScriptService();
  const completionRegistry = new TwigCompletionRegistry();
  const indexedDocuments = new Map<string, string>();
  let workspaceFolders: string[] = [];
  let workspaceReady: Promise<void> = Promise.resolve();
  let settings: TwigPlusSettings = {};
  let workspaceModelCache: ReturnType<typeof createWorkspaceModel> | null = null;
  let indexGeneration = 0;
  let formatRequestSequence = 0;
  const activeFormatRequests = new Map<string, AbortController>();
  let republishDiagnostics: (() => void) | null = null;

  const modelFor = (document: TextDocument): DocumentModel | null => {
    if (document.getText().length > MAX_DOCUMENT_LENGTH) return null;
    const cached = cache.get(document.uri);
    if (cached?.version === document.version) return cached.model;
    const model = createDocumentModel(parseDocument(document.getText()), {
      globals: settings.diagnostics?.globals ?? options.globals,
      diagnoseUnresolvedNames: settings.diagnostics?.unresolvedNames ?? options.diagnoseUnresolvedNames
    });
    cache.set(document.uri, { version: document.version, model });
    return model;
  };
  const workspaceFor = () => workspaceModelCache ??= createWorkspaceModel(
    [...indexedDocuments.entries()].map(([uri, source]) => ({ uri, source })),
    options.resolveTemplate ?? ((from, reference) => resolveWorkspaceTemplate(from, reference, workspaceFolders, indexedDocuments, settings.templates?.roots))
  );
  const refreshIndex = async () => {
    const generation = ++indexGeneration;
    const disk = await readWorkspaceIndex(workspaceFolders);
    if (generation !== indexGeneration) return;
    indexedDocuments.clear();
    for (const [uri, source] of disk) indexedDocuments.set(uri, source);
    for (const document of documents.all()) {
      if (document.getText().length <= MAX_DOCUMENT_LENGTH) indexedDocuments.set(document.uri, document.getText());
    }
    workspaceModelCache = null;
    completionRegistry.replaceProject(await readProjectCompletionMetadata(workspaceFolders));
    const message = `Indexed ${indexedDocuments.size.toLocaleString()} Twig files.`;
    if (indexedDocuments.size >= MAX_INDEXED_FILES) connection.console.warn(`${message} The ${MAX_INDEXED_FILES.toLocaleString()} file safety limit was reached.`);
    else connection.console.info(message);
  };
  const refreshUris = async (uris: string[]) => {
    for (const uri of uris) {
      const open = documents.get(uri);
      if (open) {
        if (open.getText().length <= MAX_DOCUMENT_LENGTH) indexedDocuments.set(uri, open.getText());
        else indexedDocuments.delete(uri);
        continue;
      }
      if (!uri.startsWith("file:")) { indexedDocuments.delete(uri); continue; }
      try {
        const file = fileURLToPath(uri);
        if ((await stat(file)).size <= MAX_INDEXED_FILE_BYTES) indexedDocuments.set(uri, await readFile(file, "utf8"));
        else indexedDocuments.delete(uri);
      }
      catch { indexedDocuments.delete(uri); }
    }
    workspaceModelCache = null;
  };
  const scheduleWorkspace = (task: () => Promise<void>) => {
    workspaceReady = workspaceReady
      .catch((error) => connection.console.error(`Previous workspace indexing failed: ${formatError(error)}`))
      .then(task)
      .then(() => republishDiagnostics?.())
      .catch((error) => connection.console.error(`Workspace indexing failed: ${formatError(error)}`));
  };

  connection.onInitialize((params): InitializeResult => {
    workspaceFolders = (params.workspaceFolders ?? []).map((folder) => folder.uri);
    scheduleWorkspace(refreshIndex);
    return { capabilities: getServerCapabilities() };
  });
  connection.onInitialized(() => {
    setTimeout(() => {
      void formatTwigWithResult("", {
        profile: "phpstorm", indentSize: 4, printWidth: 100, useTabs: false,
        twigTagSpacing: true, htmlAttributeWrap: "auto", preserveSingleLineBlocks: true,
        lineBreakAfterTwigControlTag: true, parserEngine: "hybrid"
      }).catch((error) => connection.console.warn(`Formatter prewarm failed: ${formatError(error)}`));
    }, 0);
  });
  connection.onDidChangeConfiguration((change) => {
    const received = isRecord(change.settings) && "twigPlus" in change.settings ? change.settings.twigPlus : change.settings;
    settings = isRecord(received) ? received as TwigPlusSettings : {};
    cache.clear();
    workspaceModelCache = null;
    for (const document of documents.all()) void publishDiagnostics(document);
  });
  connection.onDidChangeWatchedFiles((event) => {
    if (event.changes.some((change) => change.uri.endsWith("/.twig-plus/symfony-metadata.json"))) scheduleWorkspace(refreshIndex);
    else scheduleWorkspace(() => refreshUris(event.changes.map((change) => change.uri)));
  });

  const publishDiagnostics = async (document: TextDocument) => {
    const version = document.version;
    const model = modelFor(document);
    if (!model) {
      connection.sendDiagnostics({ uri: document.uri, diagnostics: [{
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        message: `TwigPlus skipped semantic analysis because this document exceeds ${MAX_DOCUMENT_LENGTH.toLocaleString()} characters.`,
        severity: DiagnosticSeverity.Information, source: "TwigPlus", code: "document-too-large"
      }] });
      return;
    }
    const workspaceContext = getWorkspaceContext(document.uri, workspaceFolders, indexedDocuments);
    const roots = settings.templates?.roots?.length ? settings.templates.roots : DEFAULT_TEMPLATE_ROOTS;
    const javascriptDiagnostics = await embeddedJavaScript.getDiagnostics(
      document.uri,
      document.version,
      model.document
    );
    const legacy = settings.parser?.engine === "legacy"
      ? analyzeTwigDiagnostics(document.getText(), workspaceContext.paths, workspaceContext.current, roots)
      : analyzeHybridDiagnostics(model.document, workspaceContext.paths, workspaceContext.current, roots);
    if (documents.get(document.uri)?.version !== version) return;
    connection.sendDiagnostics({ uri: document.uri, diagnostics: [
      ...legacy.map((diagnostic) => ({
          range: toRange(document, diagnostic), message: diagnostic.message, source: "TwigPlus", code: diagnostic.code ?? getTwigDiagnosticCode(diagnostic.message),
        severity: diagnostic.severity === "error" ? DiagnosticSeverity.Error : diagnostic.severity === "warning" ? DiagnosticSeverity.Warning : DiagnosticSeverity.Hint
      })),
      ...model.diagnostics.map((diagnostic) => ({
      range: toRange(document, diagnostic), message: diagnostic.message, code: diagnostic.code,
      source: "TwigPlus Semantic", severity: diagnostic.severity === "error" ? DiagnosticSeverity.Error : diagnostic.severity === "warning" ? DiagnosticSeverity.Warning : DiagnosticSeverity.Information
      })),
      ...javascriptDiagnostics.map((diagnostic) => ({
        range: toRange(document, diagnostic.range), message: diagnostic.message, code: diagnostic.code,
        source: "TwigPlus JavaScript", severity: DiagnosticSeverity.Error
      }))
    ] });
  };
  republishDiagnostics = () => { for (const document of documents.all()) void publishDiagnostics(document); };
  documents.onDidOpen((event) => { updateOpenDocumentIndex(event.document, indexedDocuments); workspaceModelCache = null; void publishDiagnostics(event.document); });
  documents.onDidChangeContent((event) => { cache.delete(event.document.uri); embeddedJavaScript.delete(event.document.uri); updateOpenDocumentIndex(event.document, indexedDocuments); workspaceModelCache = null; void publishDiagnostics(event.document); });
  documents.onDidClose((event) => { cache.delete(event.document.uri); embeddedJavaScript.delete(event.document.uri); scheduleWorkspace(() => refreshUris([event.document.uri])); connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] }); });

  connection.onCompletion(async (params) => {
    const completionStarted = performance.now();
    const document = documents.get(params.textDocument.uri); if (!document) return [];
    const model = modelFor(document); if (!model) return [];
    const offset = document.offsetAt(params.position);
    const lineStart = document.offsetAt({ line: params.position.line, character: 0 });
    const templateMatch = getTemplateReferenceMatch(document.getText().slice(lineStart, offset));
    if (templateMatch) {
      await workspaceReady;
      const workspaceContext = getWorkspaceContext(document.uri, workspaceFolders, indexedDocuments);
      const roots = settings.templates?.roots?.length ? settings.templates.roots : DEFAULT_TEMPLATE_ROOTS;
      const candidates = collectTemplateCompletionCandidates(workspaceContext.paths, templateMatch.prefix, workspaceContext.current, roots);
      const range = { start: document.positionAt(offset - templateMatch.prefix.length), end: params.position };
      const result = candidates.map((label) => ({ label, detail: "Twig template", kind: CompletionItemKind.File, textEdit: TextEdit.replace(range, label) }));
      connection.console.info(`[completion] template ${result.length} items ${(performance.now() - completionStarted).toFixed(1)}ms`);
      return result;
    }
    const scriptCompletions = await embeddedJavaScript.getCompletions(document.uri, document.version, model.document, offset);
    if (scriptCompletions !== null) return scriptCompletions.map((item) => ({
      label: item.label,
      detail: item.detail,
      sortText: item.sortText,
      kind: toJavaScriptCompletionKind(item.kind),
      insertText: item.snippet ?? item.insertText,
      insertTextFormat: item.snippet ? InsertTextFormat.Snippet : InsertTextFormat.PlainText,
      textEdit: item.replacement ? TextEdit.replace(toRange(document, item.replacement), item.snippet ?? item.insertText ?? item.label) : undefined
    }));
    const context = getHybridTokenContextAtOffset(model.document, offset);
    if (context.kind === "html" || context.kind === "comment" || context.stringLike || context.hashKeyLike) return [];
    const catalog = getTwigCompletions(document, model.document, offset, completionRegistry);
    const symbols = model.getVisibleSymbolsAt(offset).map((symbol) => ({
      label: symbol.name, detail: `Twig ${symbol.kind}`,
      kind: symbol.kind === "macro" ? CompletionItemKind.Function : symbol.kind === "import" ? CompletionItemKind.Module : CompletionItemKind.Variable
    }));
    const result = [...catalog, ...symbols];
    connection.console.info(`[completion] twig ${result.length} items ${(performance.now() - completionStarted).toFixed(1)}ms`);
    return result;
  });
  connection.onDefinition(async (params): Promise<Location | null> => {
    const document = documents.get(params.textDocument.uri); if (!document) return null;
    await workspaceReady;
    const workspaceLocation = workspaceFor().getDefinition(document.uri, document.offsetAt(params.position));
    if (workspaceLocation) {
      const target = documentForUri(workspaceLocation.uri, documents, indexedDocuments);
      if (target) return { uri: workspaceLocation.uri, range: toRange(target, workspaceLocation) };
    }
    const model = modelFor(document); if (!model) return null;
    const target = symbolAt(model, document.offsetAt(params.position));
    return target ? { uri: document.uri, range: toRange(document, target.nameRange) } : null;
  });
  connection.onReferences(async (params, cancellation): Promise<Location[]> => {
    const document = documents.get(params.textDocument.uri); if (!document) return [];
    await workspaceReady;
    const workspaceLocations = await workspaceFor().findReferencesAsync(document.uri, document.offsetAt(params.position), params.context.includeDeclaration, () => cancellation.isCancellationRequested);
    if (workspaceLocations.length) return workspaceLocations.flatMap((item) => {
      const target = documentForUri(item.uri, documents, indexedDocuments); return target ? [{ uri: item.uri, range: toRange(target, item) }] : [];
    });
    const model = modelFor(document); if (!model) return [];
    const target = symbolAt(model, document.offsetAt(params.position)); if (!target) return [];
    const locations = model.findReferences(target).map((reference) => ({ uri: document.uri, range: toRange(document, reference) }));
    if (params.context.includeDeclaration) locations.unshift({ uri: document.uri, range: toRange(document, target.nameRange) });
    return locations;
  });
  connection.onPrepareRename(async (params): Promise<Range | null> => {
    const document = documents.get(params.textDocument.uri); if (!document) return null;
    const model = modelFor(document); if (!model) return null;
    const offset = document.offsetAt(params.position);
    const target = symbolAt(model, offset);
    if (target) return toRange(document, target.nameRange);
    await workspaceReady;
    const reference = model.getReferenceAt(offset);
    return reference?.role === "call" && workspaceFor().getDefinition(document.uri, offset) ? toRange(document, reference) : null;
  });
  connection.onRenameRequest(async (params, cancellation) => {
    const document = documents.get(params.textDocument.uri); if (!document || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(params.newName)) return null;
    const model = modelFor(document); if (!model) return null;
    const target = symbolAt(model, document.offsetAt(params.position));
    await workspaceReady;
    const workspace = workspaceFor();
    const locations = await workspace.findReferencesAsync(document.uri, document.offsetAt(params.position), true, () => cancellation.isCancellationRequested);
    if (cancellation.isCancellationRequested) return null;
    if (locations.length > 1) {
      const definition = workspace.getDefinition(document.uri, document.offsetAt(params.position));
      const definitionModel = definition ? workspace.getDocument(definition.uri) ?? undefined : undefined;
      const definitionSymbol = definitionModel && definition ? definitionModel.getSymbolAt(definition.start) : null;
      if (definitionModel && definitionSymbol && definitionModel.getVisibleSymbolsAt(definitionSymbol.start).some((symbol) => symbol.name === params.newName && symbol.id !== definitionSymbol.id)) return null;
      const changes: Record<string, TextEdit[]> = {};
      for (const location of locations) {
        const targetDocument = documentForUri(location.uri, documents, indexedDocuments); if (!targetDocument) continue;
        (changes[location.uri] ??= []).push(TextEdit.replace(toRange(targetDocument, location), params.newName));
      }
      return { changes };
    }
    if (!target) return null;
    if (model.getVisibleSymbolsAt(target.start).some((symbol) => symbol.name === params.newName && symbol.id !== target.id)) return null;
    const edits = [target.nameRange, ...model.findReferences(target)].map((range) => TextEdit.replace(toRange(document, range), params.newName));
    return { changes: { [document.uri]: edits } };
  });
  connection.onDocumentSymbol((params): DocumentSymbol[] => {
    const document = documents.get(params.textDocument.uri); if (!document) return [];
    const model = modelFor(document); if (!model) return [];
    return model.symbols.filter((symbol) => symbol.kind === "block" || symbol.kind === "macro" || (symbol.kind === "variable" && symbol.scopeId === "scope:document")).map((symbol) => DocumentSymbol.create(
      symbol.name, `Twig ${symbol.kind}`, symbol.kind === "macro" ? SymbolKind.Function : symbol.kind === "variable" ? SymbolKind.Variable : SymbolKind.Namespace,
      toRange(document, symbol), toRange(document, symbol.nameRange)
    ));
  });
  connection.onSelectionRanges((params) => {
    const document = documents.get(params.textDocument.uri); if (!document) return [];
    const model = modelFor(document); if (!model) return [];
    const syntax = model.document;
    return params.positions.map((position) => {
      const offset = document.offsetAt(position);
      const ranges = collectHybridSelectionRanges(syntax, offset);
      let parent: SelectionRange | undefined;
      for (let index = ranges.length - 1; index >= 0; index -= 1) parent = { range: toRange(document, ranges[index]), parent };
      return parent ?? { range: { start: position, end: position } };
    });
  });
  connection.onDocumentFormatting(async (params, cancellation) => {
    const document = documents.get(params.textDocument.uri); if (!document) return [];
    if (document.getText().length > MAX_DOCUMENT_LENGTH) return [];
    const requestId = `${process.pid}-${++formatRequestSequence}`;
    activeFormatRequests.get(document.uri)?.abort();
    const formatController = new AbortController();
    activeFormatRequests.set(document.uri, formatController);
    const started = performance.now();
    let finalStatus: "completed" | "failed" = "completed";
    let finalMessage: string | undefined;
    const progress = (stage: FormatterStage, status: "started" | "completed" | "failed", elapsedMs: number, message?: string) => {
      const event = { requestId, uri: document.uri, stage, elapsedMs, status, message };
      void connection.sendNotification("twigPlus/formatProgress", event);
      connection.console.info(`[format ${requestId}] ${stage} ${status} ${elapsedMs.toFixed(1)}ms${message ? `: ${message}` : ""}`);
    };
    progress("parse", "started", 0, "Validating document and embedded code");
    try {
    const syntaxModel = modelFor(document);
    const javascriptDiagnostics = syntaxModel
      ? await embeddedJavaScript.getDiagnostics(document.uri, document.version, syntaxModel.document)
      : [];
    if (javascriptDiagnostics.length > 0) {
      const first = javascriptDiagnostics[0];
      const position = document.positionAt(first.range.start);
      const message = `TwigPlus did not modify this document: embedded JavaScript syntax error at ${position.line + 1}:${position.character + 1}. ${first.message}`;
      void connection.sendNotification("window/showMessage", { type: 1, message });
      finalStatus = "failed";
      finalMessage = message;
      return new ResponseError(
        LSPErrorCodes.RequestFailed,
        message
      );
    }
    // The language client already synchronizes the TwigPlus configuration.
    // Formatting must never block on a client-initiated configuration roundtrip.
    const documentSettings = settings;
    if (documentSettings.format?.enable === false) return [];
    const formatter: FormatterOptions = {
      profile: documentSettings.format?.profile ?? "phpstorm", indentSize: documentSettings.format?.indentSize ?? params.options.tabSize,
      printWidth: documentSettings.format?.printWidth ?? 100, useTabs: documentSettings.format?.useTabs ?? !params.options.insertSpaces,
      twigTagSpacing: documentSettings.format?.twigTagSpacing ?? true, htmlAttributeWrap: documentSettings.format?.htmlAttributeWrap ?? "auto",
      preserveSingleLineBlocks: documentSettings.format?.preserveSingleLineBlocks ?? true,
      lineBreakAfterTwigControlTag: documentSettings.format?.lineBreakAfterTwigControlTag ?? true,
      parserEngine: documentSettings.parser?.engine ?? "hybrid", ...options.formatter,
      isCancellationRequested: () => cancellation.isCancellationRequested || formatController.signal.aborted,
      onStage: (stage, elapsedMs) => progress(stage, "completed", elapsedMs)
    };
    const result = await formatTwigWithResult(document.getText(), formatter);
    if (!result.ok) {
      finalStatus = "failed";
      finalMessage = result.error.message;
      if (result.error.code === "cancelled") return [];
      throw new ResponseError(LSPErrorCodes.RequestFailed, `TwigPlus did not modify this document: ${result.error.message}`);
    }
    return result.text === document.getText() ? [] : [TextEdit.replace({ start: { line: 0, character: 0 }, end: document.positionAt(document.getText().length) }, result.text)];
    } finally {
      progress("complete", cancellation.isCancellationRequested || formatController.signal.aborted ? "failed" : finalStatus, performance.now() - started, finalMessage);
      if (activeFormatRequests.get(document.uri) === formatController) activeFormatRequests.delete(document.uri);
    }
  });

  documents.listen(connection);
  connection.listen();
}

function symbolAt(model: DocumentModel, offset: number): SemanticSymbol | null {
  const direct = model.getSymbolAt(offset); if (direct) return direct;
  const reference = model.getReferenceAt(offset);
  return reference?.resolvedSymbolId ? model.symbols.find((symbol) => symbol.id === reference.resolvedSymbolId) ?? null : null;
}
function toRange(document: TextDocument, range: { start: number; end: number }): Range { return { start: document.positionAt(range.start), end: document.positionAt(range.end) }; }
function resolveRelativeTemplate(fromUri: string, reference: string): string | null {
  try { return new URL(reference, fromUri).toString(); } catch { return null; }
}

function resolveWorkspaceTemplate(fromUri: string, reference: string, folders: string[], indexed: Map<string, string>, roots?: string[]): string | null {
  if (!fromUri.startsWith("file:")) return resolveRelativeTemplate(fromUri, reference);
  const fromPath = fileURLToPath(fromUri);
  for (const folderUri of folders.filter((uri) => uri.startsWith("file:"))) {
    const root = fileURLToPath(folderUri);
    if (!fromPath.startsWith(root + path.sep) && fromPath !== root) continue;
    const workspacePaths = [...indexed.keys()].filter((uri) => uri.startsWith("file:")).map((uri) => path.relative(root, fileURLToPath(uri)).replaceAll(path.sep, "/")).filter((item) => !item.startsWith(".."));
    const current = path.relative(root, fromPath).replaceAll(path.sep, "/");
    const resolved = resolveTemplateWorkspacePath(workspacePaths, reference, current, roots?.length ? roots : DEFAULT_TEMPLATE_ROOTS);
    return resolved ? pathToFileURL(path.join(root, resolved)).toString() : null;
  }
  return resolveRelativeTemplate(fromUri, reference);
}

async function readWorkspaceIndex(folders: string[]): Promise<Map<string, string>> {
  const target = new Map<string, string>();
  const budget = { remaining: MAX_INDEXED_FILES };
  const files: string[] = [];
  for (const uri of folders.filter((item) => item.startsWith("file:"))) {
    const root = fileURLToPath(uri);
    files.push(...await collectTwigFiles(root, budget));
    if (budget.remaining <= 0) break;
  }
  await runWithConcurrency(files, 32, async (file) => {
    try {
      if ((await stat(file)).size <= MAX_INDEXED_FILE_BYTES) target.set(pathToFileURL(file).toString(), await readFile(file, "utf8"));
    } catch { /* file changed during indexing */ }
  });
  return target;
}

async function readProjectCompletionMetadata(folders: string[]): Promise<ProjectCompletionEntry[]> {
  const completions: ProjectCompletionEntry[] = [];
  for (const uri of folders.filter((item) => item.startsWith("file:"))) {
    try {
      const file = path.join(fileURLToPath(uri), ".twig-plus", "symfony-metadata.json");
      const value = JSON.parse(await readFile(file, "utf8"));
      if (!Array.isArray(value?.completions)) continue;
      for (const entry of value.completions) {
        if (!isRecord(entry) || !["tag", "filter", "function", "test"].includes(String(entry.kind)) || typeof entry.name !== "string") continue;
        completions.push({
          kind: entry.kind as ProjectCompletionEntry["kind"], name: entry.name,
          detail: typeof entry.detail === "string" ? entry.detail : undefined,
          signature: typeof entry.signature === "string" ? entry.signature : undefined
        });
      }
    } catch { /* optional metadata never blocks generic Twig features */ }
  }
  return completions;
}
async function collectTwigFiles(directory: string, budget: { remaining: number }): Promise<string[]> {
  if (budget.remaining <= 0) return [];
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch { return []; }
  const files: string[] = [];
  for (const entry of entries) {
    if (budget.remaining <= 0) break;
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git" || entry.name === "coverage") continue;
    const item = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectTwigFiles(item, budget));
    else if (entry.name.endsWith(".twig")) { files.push(item); budget.remaining -= 1; }
  }
  return files;
}
function documentForUri(uri: string, open: TextDocuments<TextDocument>, indexed: Map<string, string>): TextDocument | null {
  return open.get(uri) ?? (indexed.has(uri) ? TextDocument.create(uri, "twig", 0, indexed.get(uri)!) : null);
}
function updateOpenDocumentIndex(document: TextDocument, indexed: Map<string, string>): void {
  if (document.getText().length <= MAX_DOCUMENT_LENGTH) indexed.set(document.uri, document.getText());
  else indexed.delete(document.uri);
}
function formatError(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
async function runWithConcurrency<T>(items: T[], limit: number, run: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const item = items[next++]; await run(item); }
  }));
}
function getWorkspaceContext(uri: string, folders: string[], indexed: Map<string, string>): { paths: string[]; current?: string } {
  if (!uri.startsWith("file:")) return { paths: [] };
  const file = fileURLToPath(uri);
  for (const folderUri of folders.filter((item) => item.startsWith("file:"))) {
    const root = fileURLToPath(folderUri);
    if (!file.startsWith(root + path.sep) && file !== root) continue;
    return {
      paths: [...indexed.keys()].filter((item) => item.startsWith("file:")).map((item) => path.relative(root, fileURLToPath(item)).replaceAll(path.sep, "/")).filter((item) => !item.startsWith("..")),
      current: path.relative(root, file).replaceAll(path.sep, "/")
    };
  }
  return { paths: [] };
}

if (require.main === module) startLanguageServer();
