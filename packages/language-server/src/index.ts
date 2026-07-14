import {
  createConnection, ProposedFeatures, TextDocuments, TextDocumentSyncKind,
  CompletionItemKind, DiagnosticSeverity, DocumentSymbol, LSPErrorCodes, MarkupKind, ResponseError, SymbolKind,
  type Hover, type InitializeResult, InsertTextFormat, type Location, type Range, type SelectionRange, type SignatureHelp, TextEdit
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { analyzeHybridDiagnostics, collectHybridSelectionRanges, collectTemplateCompletionCandidates, createDocumentModel, createWorkspaceModel, DEFAULT_TEMPLATE_ROOTS, getHybridTokenContextAtOffset, getTemplateReferenceMatch, getTwigCallable, getTwigDiagnosticCode, getTwigOperator, getTwigTag, parseDocument, resolveTemplateWorkspacePath, type DocumentModel, type SemanticSymbol, type TemplateUriResolver } from "@twig-plus/parser";
import { formatTwigRangeWithResult, formatTwigWithResult, type FormatterOptions, type FormatterStage } from "@twig-plus/formatter";
import { EmbeddedJavaScriptService } from "./embeddedJavaScript";
import { getTwigCatalogEntry, getTwigCompletions, TwigCompletionRegistry, type ProjectCompletionEntry } from "./twigCompletion";
import { collectSymfonyReferences, getSymfonyReferenceAtOffset, getSymfonyReferenceMatch, requiredSymfonyPackages, type SymfonyReferenceKind } from "./symfonyReference";
import { readStaticSymfonyReferences } from "./staticSymfonyIndex";

export interface TwigPlusServerOptions {
  diagnoseUnresolvedNames?: boolean;
  globals?: string[];
  formatter?: Partial<FormatterOptions>;
  resolveTemplate?: TemplateUriResolver;
}
interface TwigPlusSettings {
  format?: Partial<FormatterOptions> & { enable?: boolean };
  templates?: { roots?: string[] };
  diagnostics?: { unresolvedNames?: boolean; unresolvedNameMode?: "safe" | "strict" | "off"; globals?: string[] };
  twig?: { version?: string };
  symfony?: { reference?: "auto" | "on" | "off" };
}

interface LoadedSymfonyReference { name: string; detail?: string; documentation?: string; source?: { uri: string; line: number; character: number }; }
interface LoadedProjectMetadata {
  completions: ProjectCompletionEntry[];
  globals: string[];
  catalogComplete: boolean;
  twigVersion?: string;
  symfonyVersion?: string;
  contexts: Array<{ template: string; complete: boolean; variables: string[] }>;
  packages: string[];
  packageVersions: Record<string, string>;
  references: Record<SymfonyReferenceKind, LoadedSymfonyReference[]>;
  referenceCatalogsComplete: Set<SymfonyReferenceKind>;
}
interface ComposerEnvironment { twigVersion?: string; symfonyVersion?: string; packages: string[]; packageVersions: Record<string, string>; }

export function getServerCapabilities(): InitializeResult["capabilities"] {
  return {
    textDocumentSync: TextDocumentSyncKind.Incremental,
    completionProvider: { triggerCharacters: ["%", "{", " ", ".", "|", "\"", "'", "/"] },
    definitionProvider: true, referencesProvider: true, renameProvider: { prepareProvider: true },
    documentSymbolProvider: true, selectionRangeProvider: true, documentFormattingProvider: true,
    hoverProvider: true, signatureHelpProvider: { triggerCharacters: ["(", ","] }, documentRangeFormattingProvider: true
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
  let projectMetadata: LoadedProjectMetadata = {
    completions: [], globals: [], catalogComplete: false, contexts: [], packages: [], packageVersions: {},
    references: { route: [], asset: [], translation: [], form: [], security: [], fragment: [], importmap: [] },
    referenceCatalogsComplete: new Set()
  };
  const indexedDocuments = new Map<string, string>();
  let workspaceFolders: string[] = [];
  let workspaceQueue: Promise<void> = Promise.resolve();
  let workspaceReady: Promise<void> = workspaceQueue;
  let fullIndexTimer: NodeJS.Timeout | null = null;
  let fullIndexGate: { promise: Promise<void>; resolve: () => void } | null = null;
  let settings: TwigPlusSettings = {};
  let composerTwigVersion: string | undefined;
  const resourceSettings = new Map<string, TwigPlusSettings>();
  const folderSettings = new Map<string, TwigPlusSettings>();
  let supportsConfiguration = false;
  let workspaceModelCache: ReturnType<typeof createWorkspaceModel> | null = null;
  let indexGeneration = 0;
  let formatRequestSequence = 0;
  const activeFormatRequests = new Map<string, AbortController>();
  const diagnosticTimers = new Map<string, NodeJS.Timeout>();
  const diagnosticGenerations = new Map<string, number>();
  let republishDiagnostics: (() => void) | null = null;
  const settingsFor = (uri: string): TwigPlusSettings => resourceSettings.get(uri) ??
    [...folderSettings.entries()].filter(([folder]) => uri === folder || uri.startsWith(folder + "/")).sort((a, b) => b[0].length - a[0].length)[0]?.[1] ?? settings;
  const permitsSymfonyReference = (kind: SymfonyReferenceKind, mode: "auto" | "on" | "off") =>
    mode === "on" || (mode === "auto" && completionRegistry.permits("symfony-bridge") && completionRegistry.hasAnyPackage(requiredSymfonyPackages(kind)));
  const twigVersionFor = (uri: string) => settingsFor(uri).twig?.version ?? projectMetadata.twigVersion ?? composerTwigVersion;

  const modelFor = (document: TextDocument): DocumentModel | null => {
    if (document.getText().length > MAX_DOCUMENT_LENGTH) return null;
    const cached = cache.get(document.uri);
    if (cached?.version === document.version) return cached.model;
    const documentSettings = settingsFor(document.uri);
    const legacyUnresolved = documentSettings.diagnostics?.unresolvedNames ?? options.diagnoseUnresolvedNames;
    const context = projectMetadata.contexts.find((item) => document.uri.replaceAll("\\", "/").endsWith(item.template.replaceAll("\\", "/")));
    const model = createDocumentModel(parseDocument(document.getText()), {
      globals: [...(documentSettings.diagnostics?.globals ?? options.globals ?? []), ...projectMetadata.globals, ...(context?.variables ?? [])],
      unresolvedNameMode: documentSettings.diagnostics?.unresolvedNameMode ?? (legacyUnresolved === undefined ? "safe" : legacyUnresolved ? "strict" : "off"),
      contextComplete: context?.complete,
      catalogComplete: projectMetadata.catalogComplete
    });
    cache.set(document.uri, { version: document.version, model });
    return model;
  };
  const workspaceFor = () => workspaceModelCache ??= createWorkspaceModel(
    [...indexedDocuments.entries()].map(([uri, source]) => ({ uri, source })),
    options.resolveTemplate ?? ((from, reference) => resolveWorkspaceTemplate(from, reference, workspaceFolders, indexedDocuments, settingsFor(from).templates?.roots))
  );
  const refreshIndex = async () => {
    const generation = ++indexGeneration;
    const disk = await readWorkspaceIndex(workspaceFolders, (folder) => settingsFor(folder).templates?.roots);
    if (generation !== indexGeneration) return;
    indexedDocuments.clear();
    for (const [uri, source] of disk) indexedDocuments.set(uri, source);
    for (const document of documents.all()) {
      if (document.getText().length <= MAX_DOCUMENT_LENGTH) indexedDocuments.set(document.uri, document.getText());
    }
    workspaceModelCache = null;
    projectMetadata = await readProjectCompletionMetadata(workspaceFolders);
    completionRegistry.replaceProject(projectMetadata.completions);
    const composer = await readComposerEnvironment(workspaceFolders);
    composerTwigVersion = composer.twigVersion;
    completionRegistry.setPackages([...projectMetadata.packages, ...composer.packages]);
    completionRegistry.setPackageVersions({ ...composer.packageVersions, ...projectMetadata.packageVersions });
    const configuredVersion = workspaceFolders.map((folder) => settingsFor(folder).twig?.version).find(Boolean);
    connection.console.info(`Twig language specification: ${configuredVersion ?? projectMetadata.twigVersion ?? composer.twigVersion ?? "3.x latest (version unknown)"}.`);
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
        if (!isInTemplateRoots(file, workspaceFolders, settingsFor(uri).templates?.roots)) { indexedDocuments.delete(uri); continue; }
        if ((await stat(file)).size <= MAX_INDEXED_FILE_BYTES) indexedDocuments.set(uri, await readFile(file, "utf8"));
        else indexedDocuments.delete(uri);
      }
      catch { indexedDocuments.delete(uri); }
    }
    workspaceModelCache = null;
  };
  const scheduleWorkspace = (task: () => Promise<void>) => {
    workspaceQueue = workspaceQueue
      .catch((error) => connection.console.error(`Previous workspace indexing failed: ${formatError(error)}`))
      .then(task)
      .then(() => republishDiagnostics?.())
      .catch((error) => connection.console.error(`Workspace indexing failed: ${formatError(error)}`));
    workspaceReady = workspaceQueue;
  };
  const scheduleFullIndex = (delayMs = 50) => {
    if (fullIndexTimer) clearTimeout(fullIndexTimer);
    if (!fullIndexGate) {
      let resolve!: () => void;
      const promise = new Promise<void>((done) => { resolve = done; });
      fullIndexGate = { promise, resolve };
      workspaceReady = promise;
    }
    fullIndexTimer = setTimeout(() => {
      fullIndexTimer = null;
      const gate = fullIndexGate;
      fullIndexGate = null;
      scheduleWorkspace(async () => {
        await refreshFolderSettings();
        await refreshIndex();
      });
      void workspaceQueue.finally(() => gate?.resolve());
    }, delayMs);
  };

  connection.onInitialize((params): InitializeResult => {
    workspaceFolders = (params.workspaceFolders ?? []).map((folder) => folder.uri);
    supportsConfiguration = Boolean(params.capabilities.workspace?.configuration);
    return { capabilities: getServerCapabilities() };
  });
  connection.onInitialized(() => {
    setTimeout(() => {
      void formatTwigWithResult("", {
        profile: "phpstorm", indentSize: 4, printWidth: 100, useTabs: false,
        twigTagSpacing: true, htmlAttributeWrap: "auto", preserveSingleLineBlocks: true,
        lineBreakAfterTwigControlTag: true
      }).catch((error) => connection.console.warn(`Formatter prewarm failed: ${formatError(error)}`));
    }, 0);
    scheduleFullIndex();
  });
  connection.onDidChangeConfiguration((change) => {
    const received = isRecord(change.settings) && "twigPlus" in change.settings ? change.settings.twigPlus : change.settings;
    settings = isRecord(received) ? received as TwigPlusSettings : {};
    cache.clear();
    resourceSettings.clear();
    folderSettings.clear();
    workspaceModelCache = null;
    scheduleFullIndex();
    for (const document of documents.all()) scheduleDiagnostics(document, 0);
  });
  connection.onDidChangeWatchedFiles((event) => {
    if (event.changes.some((change) => change.uri.endsWith("/.twig-plus/symfony-metadata.json"))) scheduleFullIndex();
    else scheduleWorkspace(() => refreshUris(event.changes.map((change) => change.uri)));
  });

  const publishDiagnostics = async (document: TextDocument, generation: number) => {
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
    const documentSettings = settingsFor(document.uri);
    const workspaceContext = getWorkspaceContext(document.uri, workspaceFolders, indexedDocuments);
    const roots = documentSettings.templates?.roots?.length ? documentSettings.templates.roots : DEFAULT_TEMPLATE_ROOTS;
    const javascriptDiagnostics = await embeddedJavaScript.getDiagnostics(
      document.uri,
      document.version,
      model.document
    );
    const syntaxDiagnostics = analyzeHybridDiagnostics(model.document, workspaceContext.paths, workspaceContext.current, roots);
    const symfonyMode = documentSettings.symfony?.reference ?? "auto";
    const symfonyDiagnostics = collectSymfonyReferences(document.getText()).filter((reference) =>
      projectMetadata.referenceCatalogsComplete.has(reference.kind)
      && permitsSymfonyReference(reference.kind, symfonyMode)
      && !projectMetadata.references[reference.kind].some((entry) => entry.name === reference.prefix));
    const configuredTwigVersion = twigVersionFor(document.uri);
    const versionDiagnostics = configuredTwigVersion ? [
      ...model.references.flatMap((reference) => {
        const kind = reference.role === "function-call" ? "function" : reference.role === "filter" ? "filter" : reference.role === "test" ? "test" : null;
        const latest = kind ? getTwigCallable(kind, reference.name) : reference.role === "operator" ? getTwigOperator(reference.name) : undefined;
        const selected = kind ? getTwigCallable(kind, reference.name, configuredTwigVersion) : reference.role === "operator" ? getTwigOperator(reference.name, configuredTwigVersion) : undefined;
        return latest && !selected ? [{ ...reference, name: reference.name }] : [];
      }),
      ...model.document.children.flatMap((node) => {
        if (node.kind !== "TwigTag" || !node.tagName || !getTwigTag(node.tagName) || getTwigTag(node.tagName, configuredTwigVersion)) return [];
        const relative = node.raw.indexOf(node.tagName);
        const start = node.start + Math.max(0, relative);
        return [{ start, end: start + node.tagName.length, name: node.tagName }];
      })
    ] : [];
    if (documents.get(document.uri)?.version !== version || diagnosticGenerations.get(document.uri) !== generation) return;
    connection.sendDiagnostics({ uri: document.uri, diagnostics: [
      ...syntaxDiagnostics.map((diagnostic) => ({
          range: toRange(document, diagnostic), message: diagnostic.message, source: "TwigPlus", code: diagnostic.code ?? getTwigDiagnosticCode(diagnostic.message),
        severity: diagnostic.severity === "error" ? DiagnosticSeverity.Error : diagnostic.severity === "warning" ? DiagnosticSeverity.Warning : DiagnosticSeverity.Hint
      })),
      ...model.diagnostics.map((diagnostic) => ({
      range: toRange(document, diagnostic), message: diagnostic.message, code: diagnostic.code,
      source: "TwigPlus Semantic", severity: diagnostic.severity === "error" ? DiagnosticSeverity.Error : diagnostic.severity === "warning" ? DiagnosticSeverity.Warning : DiagnosticSeverity.Information
      })),
      ...symfonyDiagnostics.map((reference) => ({
        range: toRange(document, reference), message: `Unknown Symfony ${reference.kind} '${reference.prefix}'.`,
        code: `unknown-symfony-${reference.kind}`, source: "TwigPlus Symfony", severity: DiagnosticSeverity.Warning
      })),
      ...versionDiagnostics.map((diagnostic) => ({
        range: toRange(document, diagnostic), message: `Twig ${configuredTwigVersion} does not support '${diagnostic.name}'.`,
        code: "twig-version-mismatch", source: "TwigPlus Version", severity: DiagnosticSeverity.Warning
      })),
      ...javascriptDiagnostics.map((diagnostic) => ({
        range: toRange(document, diagnostic.range), message: diagnostic.message, code: diagnostic.code,
        source: "TwigPlus JavaScript", severity: DiagnosticSeverity.Error
      }))
    ] });
  };
  function scheduleDiagnostics(document: TextDocument, delayMs = 200): void {
    const generation = (diagnosticGenerations.get(document.uri) ?? 0) + 1;
    diagnosticGenerations.set(document.uri, generation);
    const existing = diagnosticTimers.get(document.uri); if (existing) clearTimeout(existing);
    diagnosticTimers.set(document.uri, setTimeout(() => {
      diagnosticTimers.delete(document.uri);
      void publishDiagnostics(document, generation);
    }, delayMs));
  }
  async function refreshResourceSettings(document: TextDocument): Promise<void> {
    if (!supportsConfiguration) return;
    try {
      const value = await connection.workspace.getConfiguration({ scopeUri: document.uri, section: "twigPlus" });
      if (isRecord(value)) resourceSettings.set(document.uri, normalizeSettings(value as TwigPlusSettings));
      cache.delete(document.uri); scheduleDiagnostics(document, 0);
    } catch (error) { connection.console.warn(`Unable to load resource settings for ${document.uri}: ${formatError(error)}`); }
  }
  async function refreshFolderSettings(): Promise<void> {
    if (!supportsConfiguration) return;
    await Promise.all(workspaceFolders.map(async (folder) => {
      try {
        const value = await connection.workspace.getConfiguration({ scopeUri: folder, section: "twigPlus" });
        if (isRecord(value)) folderSettings.set(folder, normalizeSettings(value as TwigPlusSettings));
      } catch (error) { connection.console.warn(`Unable to load workspace-folder settings for ${folder}: ${formatError(error)}`); }
    }));
  }
  republishDiagnostics = () => { for (const document of documents.all()) scheduleDiagnostics(document, 0); };
  documents.onDidOpen((event) => { updateOpenDocumentIndex(event.document, indexedDocuments); workspaceModelCache = null; scheduleDiagnostics(event.document, 0); void refreshResourceSettings(event.document); });
  documents.onDidChangeContent((event) => { cache.delete(event.document.uri); embeddedJavaScript.delete(event.document.uri); updateOpenDocumentIndex(event.document, indexedDocuments); workspaceModelCache = null; scheduleDiagnostics(event.document); });
  documents.onDidClose((event) => {
    cache.delete(event.document.uri); embeddedJavaScript.delete(event.document.uri);
    const timer = diagnosticTimers.get(event.document.uri); if (timer) clearTimeout(timer);
    diagnosticTimers.delete(event.document.uri); diagnosticGenerations.delete(event.document.uri);
    resourceSettings.delete(event.document.uri);
    activeFormatRequests.get(event.document.uri)?.abort(); activeFormatRequests.delete(event.document.uri);
    scheduleWorkspace(() => refreshUris([event.document.uri])); connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
  });

  connection.onCompletion(async (params) => {
    const completionStarted = performance.now();
    const document = documents.get(params.textDocument.uri); if (!document) return [];
    const model = modelFor(document); if (!model) return [];
    const offset = document.offsetAt(params.position);
    const lineStart = document.offsetAt({ line: params.position.line, character: 0 });
    const symfonyMatch = getSymfonyReferenceMatch(document.getText(), offset);
    const symfonyMode = settingsFor(document.uri).symfony?.reference ?? "auto";
    if (symfonyMatch && symfonyMode !== "off") {
      await workspaceReady;
      if (!permitsSymfonyReference(symfonyMatch.kind, symfonyMode)) return [];
      const range = { start: document.positionAt(symfonyMatch.start), end: document.positionAt(symfonyMatch.end) };
      return projectMetadata.references[symfonyMatch.kind]
        .filter((entry) => entry.name.toLowerCase().includes(symfonyMatch.prefix.toLowerCase()))
        .map((entry) => ({
          label: entry.name,
          detail: entry.detail ?? `Symfony ${symfonyMatch.kind}`,
          kind: symfonyMatch.kind === "asset" ? CompletionItemKind.File : CompletionItemKind.Reference,
          textEdit: TextEdit.replace(range, entry.name)
        }));
    }
    const templateMatch = getTemplateReferenceMatch(document.getText().slice(lineStart, offset));
    if (templateMatch) {
      await workspaceReady;
      const workspaceContext = getWorkspaceContext(document.uri, workspaceFolders, indexedDocuments);
      const documentSettings = settingsFor(document.uri);
      const roots = documentSettings.templates?.roots?.length ? documentSettings.templates.roots : DEFAULT_TEMPLATE_ROOTS;
      const candidates = collectTemplateCompletionCandidates(workspaceContext.paths, templateMatch.prefix, workspaceContext.current, roots);
      const range = { start: document.positionAt(offset - templateMatch.prefix.length), end: params.position };
      const result = candidates.map((label) => ({ label, detail: "Twig template", kind: CompletionItemKind.File, textEdit: TextEdit.replace(range, label) }));
      connection.console.info(`[completion] template ${result.length} items ${(performance.now() - completionStarted).toFixed(1)}ms`);
      return result;
    }
    const scriptCompletions = await embeddedJavaScript.getCompletions(document.uri, document.version, model.document, offset, {
      triggerCharacter: params.context?.triggerCharacter
    });
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
    const catalog = getTwigCompletions(document, model.document, offset, completionRegistry, twigVersionFor(document.uri));
    const symbols = model.getVisibleSymbolsAt(offset).map((symbol) => ({
      label: symbol.name, detail: `Twig ${symbol.kind}`,
      kind: symbol.kind === "macro" ? CompletionItemKind.Function : symbol.kind === "import" ? CompletionItemKind.Module : CompletionItemKind.Variable
    }));
    const result = [...catalog, ...symbols];
    connection.console.info(`[completion] twig ${result.length} items ${(performance.now() - completionStarted).toFixed(1)}ms`);
    return result;
  });
  connection.onHover(async (params): Promise<Hover | null> => {
    const document = documents.get(params.textDocument.uri); if (!document) return null;
    const model = modelFor(document); if (!model) return null;
    const offset = document.offsetAt(params.position);
    const symfonyReference = getSymfonyReferenceAtOffset(document.getText(), offset);
    if (symfonyReference) {
      await workspaceReady;
      const mode = settingsFor(document.uri).symfony?.reference ?? "auto";
      const entry = permitsSymfonyReference(symfonyReference.kind, mode)
        ? projectMetadata.references[symfonyReference.kind].find((item) => item.name === symfonyReference.prefix) : undefined;
      if (entry) return {
        contents: { kind: MarkupKind.Markdown, value: [`**Symfony ${symfonyReference.kind}**`, `\`${entry.name}\``, entry.detail, entry.documentation].filter(Boolean).join("\n\n") },
        range: toRange(document, symfonyReference)
      };
    }
    const script = await embeddedJavaScript.getHover(document.uri, document.version, model.document, offset);
    if (script) return { contents: { kind: MarkupKind.Markdown, value: script.contents }, range: toRange(document, script.range) };
    const context = getHybridTokenContextAtOffset(model.document, offset);
    if (context.kind === "html" || context.kind === "comment") return null;
    const word = wordAt(document.getText(), offset); if (!word) return null;
    const symbol = symbolAt(model, offset) ?? model.getVisibleSymbolsAt(offset).find((item) => item.name === word.value);
    if (symbol) {
      const signature = signatureForSymbol(symbol);
      return { contents: { kind: MarkupKind.Markdown, value: `\`\`\`twig\n${signature}\n\`\`\`\nTwig ${symbol.kind}` }, range: toRange(document, word) };
    }
    const entry = getTwigCatalogEntry(word.value, completionRegistry, undefined, twigVersionFor(document.uri)); if (!entry) return null;
    const heading = entry.signature ?? entry.name;
    return { contents: { kind: MarkupKind.Markdown, value: [`\`\`\`twig\n${heading}\n\`\`\``, entry.detail, entry.documentation].filter(Boolean).join("\n\n") }, range: toRange(document, word) };
  });
  connection.onSignatureHelp(async (params): Promise<SignatureHelp | null> => {
    const document = documents.get(params.textDocument.uri); if (!document) return null;
    const model = modelFor(document); if (!model) return null;
    const offset = document.offsetAt(params.position);
    const script = await embeddedJavaScript.getSignatureHelp(document.uri, document.version, model.document, offset);
    if (script) return { signatures: [{ label: script.label, documentation: script.documentation, parameters: script.parameters.map((label) => ({ label })) }], activeSignature: 0, activeParameter: script.activeParameter };
    const call = callAt(document.getText(), offset); if (!call) return null;
    const visible = model.getVisibleSymbolsAt(offset).find((item) => item.name === call.name && item.kind === "macro");
    const entry = getTwigCatalogEntry(call.name, completionRegistry, ["function", "filter", "test"], twigVersionFor(document.uri));
    let label = visible ? signatureForSymbol(visible) : entry?.signature;
    if (!label) {
      await workspaceReady;
      const definition = workspaceFor().getDefinition(document.uri, call.start);
      const definitionModel = definition ? workspaceFor().getDocument(definition.uri) : null;
      const definitionSymbol = definitionModel && definition ? definitionModel.getSymbolAt(definition.start) : null;
      if (definitionModel && definitionSymbol?.kind === "macro") label = signatureForSymbol(definitionSymbol);
    }
    if (!label) return null;
    const parameters = parametersFromSignature(label);
    return { signatures: [{ label, documentation: entry?.documentation, parameters: parameters.map((parameter) => ({ label: parameter })) }], activeSignature: 0, activeParameter: Math.min(call.activeParameter, Math.max(0, parameters.length - 1)) };
  });
  connection.onDefinition(async (params): Promise<Location | null> => {
    const document = documents.get(params.textDocument.uri); if (!document) return null;
    await workspaceReady;
    const symfonyReference = getSymfonyReferenceAtOffset(document.getText(), document.offsetAt(params.position));
    if (symfonyReference) {
      const mode = settingsFor(document.uri).symfony?.reference ?? "auto";
      const entry = permitsSymfonyReference(symfonyReference.kind, mode)
        ? projectMetadata.references[symfonyReference.kind].find((item) => item.name === symfonyReference.prefix) : undefined;
      if (entry?.source) return {
        uri: entry.source.uri,
        range: { start: { line: entry.source.line, character: entry.source.character }, end: { line: entry.source.line, character: entry.source.character + entry.name.length } }
      };
    }
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
    return reference?.role === "function-call" && workspaceFor().getDefinition(document.uri, offset) ? toRange(document, reference) : null;
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
    const documentSettings = settingsFor(document.uri);
    if (documentSettings.format?.enable === false) return [];
    const formatter: FormatterOptions = {
      profile: documentSettings.format?.profile ?? "phpstorm", indentSize: documentSettings.format?.indentSize ?? params.options.tabSize,
      printWidth: documentSettings.format?.printWidth ?? 100, useTabs: documentSettings.format?.useTabs ?? !params.options.insertSpaces,
      twigTagSpacing: documentSettings.format?.twigTagSpacing ?? true, htmlAttributeWrap: documentSettings.format?.htmlAttributeWrap ?? "auto",
      preserveSingleLineBlocks: documentSettings.format?.preserveSingleLineBlocks ?? true,
      lineBreakAfterTwigControlTag: documentSettings.format?.lineBreakAfterTwigControlTag ?? true,
      ...options.formatter,
      isCancellationRequested: () => cancellation.isCancellationRequested || formatController.signal.aborted,
      onHybridFailure: (failure) => connection.console.warn(`[hybrid-failure] ${failure.query} ${failure.reason} ${document.uri}${failure.message ? `: ${failure.message}` : ""}`),
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
  connection.onDocumentRangeFormatting(async (params, cancellation) => {
    const document = documents.get(params.textDocument.uri); if (!document) return [];
    const config = settingsFor(document.uri).format ?? {};
    const result = await formatTwigRangeWithResult(document.getText(), {
      start: document.offsetAt(params.range.start), end: document.offsetAt(params.range.end)
    }, {
      profile: config.profile ?? "phpstorm", indentSize: config.indentSize ?? params.options.tabSize,
      printWidth: config.printWidth ?? 100, useTabs: config.useTabs ?? !params.options.insertSpaces,
      twigTagSpacing: config.twigTagSpacing ?? true, htmlAttributeWrap: config.htmlAttributeWrap ?? "auto",
      preserveSingleLineBlocks: config.preserveSingleLineBlocks ?? true,
      lineBreakAfterTwigControlTag: config.lineBreakAfterTwigControlTag ?? true,
      isCancellationRequested: () => cancellation.isCancellationRequested,
      onHybridFailure: (failure) => connection.console.warn(`[hybrid-failure] ${failure.query} ${failure.reason} ${document.uri}${failure.message ? `: ${failure.message}` : ""}`)
    });
    if (!result.ok) { connection.console.warn(`[range-format] ${result.error.code}: ${result.error.message}`); return []; }
    return result.text === document.getText().slice(result.range.start, result.range.end) ? [] : [TextEdit.replace(toRange(document, result.range), result.text)];
  });

  documents.listen(connection);
  connection.listen();
}

function symbolAt(model: DocumentModel, offset: number): SemanticSymbol | null {
  const direct = model.getSymbolAt(offset); if (direct) return direct;
  const reference = model.getReferenceAt(offset);
  return reference?.resolvedSymbolId ? model.symbols.find((symbol) => symbol.id === reference.resolvedSymbolId) ?? null : null;
}
function wordAt(source: string, offset: number): { value: string; start: number; end: number } | null {
  let start = offset; let end = offset;
  while (start > 0 && /[A-Za-z0-9_]/.test(source[start - 1])) start -= 1;
  while (end < source.length && /[A-Za-z0-9_]/.test(source[end])) end += 1;
  const value = source.slice(start, end); return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value) ? { value, start, end } : null;
}
function signatureForSymbol(symbol: SemanticSymbol): string {
  if (symbol.kind !== "macro") return `${symbol.kind} ${symbol.name}`;
  return `${symbol.name}(${(symbol.parameters ?? []).join(", ")})`;
}
function callAt(source: string, offset: number): { name: string; start: number; activeParameter: number } | null {
  let depth = 0;
  for (let index = offset - 1; index >= 0; index -= 1) {
    if (source[index] === ")") depth += 1;
    else if (source[index] === "(") {
      if (depth > 0) { depth -= 1; continue; }
      const word = wordAt(source, index); if (!word || word.end !== index) return null;
      return { name: word.value, start: word.start, activeParameter: countTopLevelCommas(source.slice(index + 1, offset)) };
    }
  }
  return null;
}
function countTopLevelCommas(source: string): number { let depth = 0; let count = 0; for (const character of source) { if ("([{".includes(character)) depth += 1; else if (")]}".includes(character)) depth = Math.max(0, depth - 1); else if (character === "," && depth === 0) count += 1; } return count; }
function parametersFromSignature(signature: string): string[] { const match = signature.match(/\((.*)\)/); return match?.[1] ? match[1].split(",").map((item) => item.trim()) : []; }
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

async function readWorkspaceIndex(folders: string[], rootsFor?: (folderUri: string) => string[] | undefined): Promise<Map<string, string>> {
  const target = new Map<string, string>();
  const budget = { remaining: MAX_INDEXED_FILES };
  const files: string[] = [];
  for (const uri of folders.filter((item) => item.startsWith("file:"))) {
    const root = fileURLToPath(uri);
    const roots = rootsFor?.(uri);
    for (const directory of await resolveTemplateDirectories(root, roots?.length ? roots : DEFAULT_TEMPLATE_ROOTS)) {
      files.push(...await collectTwigFiles(directory, budget));
      if (budget.remaining <= 0) break;
    }
    if (budget.remaining <= 0) break;
  }
  await runWithConcurrency(files, 32, async (file) => {
    try {
      if ((await stat(file)).size <= MAX_INDEXED_FILE_BYTES) target.set(pathToFileURL(file).toString(), await readFile(file, "utf8"));
    } catch { /* file changed during indexing */ }
  });
  return target;
}

async function readProjectCompletionMetadata(folders: string[]): Promise<LoadedProjectMetadata> {
  const completions: ProjectCompletionEntry[] = [];
  const globals: string[] = [];
  const contexts: LoadedProjectMetadata["contexts"] = [];
  let catalogComplete = false;
  let twigVersion: string | undefined;
  let symfonyVersion: string | undefined;
  const packages: string[] = [];
  const packageVersions: Record<string, string> = {};
  const references: LoadedProjectMetadata["references"] = { route: [], asset: [], translation: [], form: [], security: [], fragment: [], importmap: [] };
  const referenceCatalogsComplete = new Set<SymfonyReferenceKind>();
  const maxMetadataBytes = 5_000_000;
  const maxEntries = 10_000;
  for (const uri of folders.filter((item) => item.startsWith("file:"))) {
    try {
      const file = path.join(fileURLToPath(uri), ".twig-plus", "symfony-metadata.json");
      if ((await stat(file)).size > maxMetadataBytes) continue;
      const value = JSON.parse(await readFile(file, "utf8"));
      const workspaceRoot = fileURLToPath(uri);
      if (typeof value?.projectRoot === "string" && path.resolve(value.projectRoot) !== path.resolve(workspaceRoot)) continue;
      const rawEntries = [
        ...(Array.isArray(value?.completions) ? value.completions : []),
        ...Object.values(isRecord(value?.symbols) ? value.symbols : {}).flatMap((entries) => Array.isArray(entries) ? entries : [])
      ];
      for (const entry of rawEntries.slice(0, maxEntries)) {
        if (!isRecord(entry) || !["tag", "filter", "function", "test"].includes(String(entry.kind)) || typeof entry.name !== "string") continue;
        completions.push({
          kind: entry.kind as ProjectCompletionEntry["kind"], name: entry.name,
          detail: typeof entry.detail === "string" ? entry.detail : undefined,
          signature: typeof entry.signature === "string" ? entry.signature : undefined,
          documentation: typeof entry.documentation === "string" ? entry.documentation : undefined
        });
      }
      const symbolGlobals = isRecord(value?.symbols) && Array.isArray(value.symbols.globals) ? value.symbols.globals : [];
      for (const entry of symbolGlobals.slice(0, maxEntries)) if (isRecord(entry) && typeof entry.name === "string") globals.push(entry.name);
      if (Array.isArray(value?.contexts)) for (const entry of value.contexts.slice(0, maxEntries)) {
        if (!isRecord(entry) || typeof entry.template !== "string" || typeof entry.complete !== "boolean" || !Array.isArray(entry.variables)) continue;
        const variables = entry.variables.filter((item): item is string => typeof item === "string").slice(0, maxEntries);
        contexts.push({ template: entry.template, complete: entry.complete, variables });
      }
      if (isRecord(value?.references)) {
        for (const [metadataKey, kind] of [
          ["routes", "route"], ["assets", "asset"], ["translations", "translation"], ["forms", "form"],
          ["security", "security"], ["fragments", "fragment"], ["importmaps", "importmap"]
        ] as const) {
          const entries = value.references[metadataKey];
          if (!Array.isArray(entries)) continue;
          for (const entry of entries.slice(0, maxEntries)) {
            if (typeof entry === "string") references[kind].push({ name: entry });
            else if (isRecord(entry) && typeof entry.name === "string") {
              let source: LoadedSymfonyReference["source"];
              if (isRecord(entry.source) && typeof entry.source.path === "string") {
                const sourcePath = path.resolve(workspaceRoot, entry.source.path);
                const relative = path.relative(workspaceRoot, sourcePath);
                if (!relative.startsWith("..") && !path.isAbsolute(relative)) source = {
                  uri: pathToFileURL(sourcePath).toString(),
                  line: typeof entry.source.line === "number" && entry.source.line >= 0 ? Math.floor(entry.source.line) : 0,
                  character: typeof entry.source.character === "number" && entry.source.character >= 0 ? Math.floor(entry.source.character) : 0
                };
              }
              references[kind].push({
                name: entry.name,
                detail: typeof entry.detail === "string" ? entry.detail : undefined,
                documentation: typeof entry.documentation === "string" ? entry.documentation : undefined,
                source
              });
            }
          }
        }
      }
      if (isRecord(value?.environment)) {
        if (typeof value.environment.twigVersion === "string" && /^3\.\d+(?:\.\d+)?/.test(value.environment.twigVersion)) twigVersion ??= value.environment.twigVersion;
        if (typeof value.environment.symfonyVersion === "string" && /^\d+\.\d+(?:\.\d+)?/.test(value.environment.symfonyVersion)) symfonyVersion ??= value.environment.symfonyVersion;
        if (value.environment.catalogComplete === true) catalogComplete = true;
        if (Array.isArray(value.environment.packages)) packages.push(...value.environment.packages.filter((item: unknown): item is string => typeof item === "string").slice(0, maxEntries));
        if (isRecord(value.environment.packageVersions)) for (const [name, version] of Object.entries(value.environment.packageVersions).slice(0, maxEntries)) {
          if (/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(name) && typeof version === "string" && /^v?\d+\.\d+/.test(version)) packageVersions[name] = version.replace(/^v/, "");
        }
        if (Array.isArray(value.environment.referenceCatalogsComplete)) for (const kind of value.environment.referenceCatalogsComplete) {
          if (["route", "asset", "translation", "form", "security", "fragment", "importmap"].includes(String(kind))) referenceCatalogsComplete.add(kind as SymfonyReferenceKind);
        }
      }
    } catch { /* optional metadata never blocks generic Twig features */ }
    try {
      const workspaceRoot = fileURLToPath(uri);
      for (const entry of await readStaticSymfonyReferences(workspaceRoot)) references[entry.kind].push({
        name: entry.name, detail: entry.detail,
        source: { uri: pathToFileURL(path.resolve(workspaceRoot, entry.source.path)).toString(), line: entry.source.line, character: entry.source.character }
      });
    } catch { /* bounded static indexes are optional */ }
  }
  for (const kind of Object.keys(references) as SymfonyReferenceKind[]) {
    references[kind] = references[kind].filter((entry, index, all) => all.findIndex((item) => item.name === entry.name) === index);
  }
  if (symfonyVersion && !packageVersions["symfony/twig-bridge"]) packageVersions["symfony/twig-bridge"] = symfonyVersion;
  return { completions, globals, contexts, catalogComplete, twigVersion, symfonyVersion, packages: [...new Set(packages)], packageVersions, references, referenceCatalogsComplete };
}

async function readComposerEnvironment(folders: string[]): Promise<ComposerEnvironment> {
  const result: ComposerEnvironment = { packages: [], packageVersions: {} };
  for (const uri of folders.filter((item) => item.startsWith("file:"))) {
    try {
      const file = path.join(fileURLToPath(uri), "composer.lock");
      if ((await stat(file)).size > 10_000_000) continue;
      const value = JSON.parse(await readFile(file, "utf8"));
      const packages = [...(Array.isArray(value?.packages) ? value.packages : []), ...(Array.isArray(value?.["packages-dev"]) ? value["packages-dev"] : [])];
      result.packages.push(...packages.filter(isRecord).map((entry) => entry.name).filter((name): name is string => typeof name === "string"));
      for (const entry of packages.filter(isRecord)) if (typeof entry.name === "string" && typeof entry.version === "string") result.packageVersions[entry.name] = entry.version.replace(/^v/, "");
      const twig = packages.find((entry) => isRecord(entry) && entry.name === "twig/twig");
      if (isRecord(twig) && typeof twig.version === "string") result.twigVersion ??= twig.version.replace(/^v/, "");
      const bridge = packages.find((entry) => isRecord(entry) && entry.name === "symfony/twig-bridge");
      if (isRecord(bridge) && typeof bridge.version === "string") result.symfonyVersion ??= bridge.version.replace(/^v/, "");
    } catch { /* composer metadata is optional */ }
  }
  result.packages = [...new Set(result.packages)];
  return result;
}
async function collectTwigFiles(directory: string, budget: { remaining: number }): Promise<string[]> {
  if (budget.remaining <= 0) return [];
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch { return []; }
  const files: string[] = [];
  for (const entry of entries) {
    if (budget.remaining <= 0) break;
    if (INDEX_EXCLUDED_DIRECTORIES.has(entry.name)) continue;
    const item = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectTwigFiles(item, budget));
    else if (entry.name.endsWith(".twig")) { files.push(item); budget.remaining -= 1; }
  }
  return files;
}
const INDEX_EXCLUDED_DIRECTORIES = new Set([".git", "node_modules", "vendor", "dist", "build", "coverage", "cache", ".cache", "var"]);
async function resolveTemplateDirectories(workspaceRoot: string, roots: string[]): Promise<string[]> {
  let directories = [workspaceRoot];
  const results: string[] = [];
  for (const rootPattern of roots) {
    directories = [workspaceRoot];
    for (const segment of rootPattern.replaceAll("\\", "/").split("/").filter(Boolean)) {
      const next: string[] = [];
      for (const directory of directories) {
        if (segment !== "*") { next.push(path.join(directory, segment)); continue; }
        try {
          for (const entry of await readdir(directory, { withFileTypes: true })) if (entry.isDirectory() && !INDEX_EXCLUDED_DIRECTORIES.has(entry.name)) next.push(path.join(directory, entry.name));
        } catch { /* missing optional root */ }
      }
      directories = next;
    }
    for (const directory of directories) {
      try { if ((await stat(directory)).isDirectory()) results.push(directory); } catch { /* missing optional root */ }
    }
  }
  return [...new Set(results)];
}
function isInTemplateRoots(file: string, folders: string[], roots?: string[]): boolean {
  const patterns = roots?.length ? roots : DEFAULT_TEMPLATE_ROOTS;
  for (const folder of folders.filter((item) => item.startsWith("file:"))) {
    const workspaceRoot = fileURLToPath(folder);
    const relative = path.relative(workspaceRoot, file).replaceAll(path.sep, "/");
    if (relative.startsWith("../") || path.isAbsolute(relative)) continue;
    const segments = relative.split("/");
    if (patterns.some((pattern) => pattern.replaceAll("\\", "/").split("/").filter(Boolean)
      .every((segment, index) => segment === "*" ? Boolean(segments[index]) : segments[index] === segment))) return true;
  }
  return false;
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
function normalizeSettings(value: TwigPlusSettings): TwigPlusSettings { return value; }
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
