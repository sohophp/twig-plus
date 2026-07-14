import { afterEach, describe, expect, it } from "vitest";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, mkdir, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

let child: ChildProcessWithoutNullStreams | null = null;
let temporaryDirectory: string | null = null;
afterEach(async () => {
  child?.kill(); child = null;
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = null;
});

describe("bundled TwigPlus language server", () => {
  it("starts over stdio and completes the LSP initialize handshake", async () => {
    const client = startClient();
    const message = await client.request("initialize", { processId: process.pid, rootUri: null, capabilities: {}, workspaceFolders: [] });
    expect(message.result.capabilities).toMatchObject({
      definitionProvider: true, referencesProvider: true,
      renameProvider: { prepareProvider: true }, documentFormattingProvider: true,
      semanticTokensProvider: { full: true, range: true },
      codeActionProvider: { codeActionKinds: ["quickfix"] }
    });
  });

  it("loads browser globals in the bundled server for embedded JavaScript completion", async () => {
    const client = startClient();
    await client.request("initialize", { processId: process.pid, rootUri: null, capabilities: {}, workspaceFolders: [] });
    client.notify("initialized", {});
    const uri = "untitled:browser-globals.html.twig";
    const source = `<script>document.addEven</script>`;
    client.notify("textDocument/didOpen", { textDocument: { uri, languageId: "twig", version: 1, text: source } });
    const completion = await client.request("textDocument/completion", {
      textDocument: { uri }, position: { line: 0, character: source.indexOf("addEven") + "addEven".length }
    });
    expect(completion.result).toEqual(expect.arrayContaining([expect.objectContaining({
      label: "addEventListener",
      insertText: "addEventListener(${1})",
      insertTextFormat: 2,
      textEdit: expect.objectContaining({ newText: "addEventListener(${1})" })
    })]));

    const punctuation = `<script>document.addEventListener("DOMContentLoaded", ())</script>`;
    client.notify("textDocument/didChange", {
      textDocument: { uri, version: 2 }, contentChanges: [{ text: punctuation }]
    });
    const argumentOffset = punctuation.indexOf("()") + 1;
    const automatic = await client.request("textDocument/completion", {
      textDocument: { uri }, position: positionAt(punctuation, argumentOffset),
      context: { triggerKind: 2, triggerCharacter: "(" }
    });
    expect(automatic.result).toEqual([]);
    const explicit = await client.request("textDocument/completion", {
      textDocument: { uri }, position: positionAt(punctuation, argumentOffset), context: { triggerKind: 1 }
    });
    expect(explicit.result.length).toBeGreaterThan(0);
  });

  it("maps embedded JavaScript definitions back through the bundled server", async () => {
    const client = startClient();
    await client.request("initialize", { processId: process.pid, rootUri: null, capabilities: {}, workspaceFolders: [] });
    client.notify("initialized", {});
    const uri = "untitled:embedded-definition.html.twig";
    const source = `<script>\nconst formatTitle = (value) => value.toUpperCase();\nconst title = formatTitle("Home");\n</script>`;
    client.notify("textDocument/didOpen", { textDocument: { uri, languageId: "twig", version: 1, text: source } });
    const usage = source.lastIndexOf("formatTitle") + 2;
    const definition = await client.request("textDocument/definition", {
      textDocument: { uri }, position: positionAt(source, usage)
    });
    expect(definition.result).toEqual({
      uri,
      range: {
        start: positionAt(source, source.indexOf("formatTitle")),
        end: positionAt(source, source.indexOf("formatTitle") + "formatTitle".length)
      }
    });

    const isolated = `<script>const local = 1;</script><script>console.log(local);</script>`;
    client.notify("textDocument/didChange", {
      textDocument: { uri, version: 2 }, contentChanges: [{ text: isolated }]
    });
    const missing = await client.request("textDocument/definition", {
      textDocument: { uri }, position: positionAt(isolated, isolated.lastIndexOf("local") + 2)
    });
    expect(missing.result).toBeNull();
  });

  it("prepares and applies safe embedded JavaScript renames through the bundled server", async () => {
    const client = startClient();
    await client.request("initialize", { processId: process.pid, rootUri: null, capabilities: {}, workspaceFolders: [] });
    client.notify("initialized", {});
    const uri = "untitled:embedded-rename.html.twig";
    const source = `<script>const total = 1; console.log(total);</script>`;
    client.notify("textDocument/didOpen", { textDocument: { uri, languageId: "twig", version: 1, text: source } });
    const usage = source.lastIndexOf("total") + 2;
    const prepared = await client.request("textDocument/prepareRename", {
      textDocument: { uri }, position: positionAt(source, usage)
    });
    expect(prepared.result).toEqual({
      start: positionAt(source, source.lastIndexOf("total")),
      end: positionAt(source, source.lastIndexOf("total") + "total".length)
    });
    const renamed = await client.request("textDocument/rename", {
      textDocument: { uri }, position: positionAt(source, usage), newName: "sum"
    });
    expect(renamed.result?.changes?.[uri]).toHaveLength(2);
    expect(renamed.result?.changes?.[uri]).toEqual(expect.arrayContaining([
      expect.objectContaining({
        newText: "sum", range: expect.objectContaining({ start: positionAt(source, source.indexOf("total")) })
      }),
      expect.objectContaining({
        newText: "sum", range: expect.objectContaining({ start: positionAt(source, source.lastIndexOf("total")) })
      })
    ]));

    const collision = `<script>const first = 1; const second = 2; console.log(first);</script>`;
    client.notify("textDocument/didChange", {
      textDocument: { uri, version: 2 }, contentChanges: [{ text: collision }]
    });
    const rejected = await client.request("textDocument/rename", {
      textDocument: { uri }, position: positionAt(collision, collision.lastIndexOf("first") + 2), newName: "second"
    });
    expect(rejected.result).toBeNull();
  });

  it("serves mapped full and range semantic tokens for embedded JavaScript", async () => {
    const client = startClient();
    const initialized = await client.request("initialize", {
      processId: process.pid, rootUri: null, capabilities: {}, workspaceFolders: []
    });
    client.notify("initialized", {});
    const uri = "untitled:embedded-semantic-tokens.html.twig";
    const source = `<script>\nclass Page { render(value) { return value; } }\nconst page = new Page(); page.render("x");\n</script>`;
    client.notify("textDocument/didOpen", { textDocument: { uri, languageId: "twig", version: 1, text: source } });
    const legend = initialized.result.capabilities.semanticTokensProvider.legend;
    const full = await client.request("textDocument/semanticTokens/full", { textDocument: { uri } });
    const decoded = decodeSemanticTokens(source, full.result.data, legend);
    expect(decoded).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: "Page", type: "class" }),
      expect.objectContaining({ text: "render", type: "method" }),
      expect.objectContaining({ text: "value", type: "parameter" }),
      expect.objectContaining({ text: "page", type: "variable" })
    ]));
    expect(decoded.every((token) => token.line === 1 || token.line === 2)).toBe(true);

    const range = await client.request("textDocument/semanticTokens/range", {
      textDocument: { uri }, range: { start: { line: 2, character: 0 }, end: { line: 3, character: 0 } }
    });
    const rangeDecoded = decodeSemanticTokens(source, range.result.data, legend);
    expect(rangeDecoded.length).toBeGreaterThan(0);
    expect(rangeDecoded.every((token) => token.line === 2)).toBe(true);
    expect(rangeDecoded.some((token) => token.text === "Page" && token.type === "class")).toBe(true);
  });

  it("provides atomic structural Twig quick fixes through the bundled server", async () => {
    const client = startClient();
    await client.request("initialize", { processId: process.pid, rootUri: null, capabilities: {}, workspaceFolders: [] });
    client.notify("initialized", {});
    const uri = "untitled:twig-quick-fix.html.twig";
    const source = `{% if user %}\n  {% for item in items %}\n    {{ item }}`;
    const published = client.waitForNotification("textDocument/publishDiagnostics");
    client.notify("textDocument/didOpen", { textDocument: { uri, languageId: "twig", version: 1, text: source } });
    const diagnostics = (await published).params.diagnostics;
    const unclosed = diagnostics.find((diagnostic: { message: string }) => diagnostic.message.includes('"for"'));
    expect(unclosed).toBeDefined();
    const actions = await client.request("textDocument/codeAction", {
      textDocument: { uri }, range: unclosed.range, context: { diagnostics: [unclosed], only: ["quickfix"] }
    });
    expect(actions.result).toEqual(expect.arrayContaining([expect.objectContaining({
      title: "Insert all missing Twig closing tags",
      kind: "quickfix",
      isPreferred: true,
      edit: { changes: { [uri]: [{
        range: { start: positionAt(source, source.length), end: positionAt(source, source.length) },
        newText: `\n  {% endfor %}\n{% endif %}`
      }] } }
    })]));
  });

  it("owns Twig catalog completion and reports structured format progress", async () => {
    const client = startClient();
    await client.request("initialize", { processId: process.pid, rootUri: null, capabilities: {}, workspaceFolders: [] });
    client.notify("initialized", {});
    const uri = "untitled:twig-completion.html.twig";
    const source = `{% bl %}\n{{ name|upp }}`;
    client.notify("textDocument/didOpen", { textDocument: { uri, languageId: "twig", version: 1, text: source } });
    const completion = await client.request("textDocument/completion", { textDocument: { uri }, position: { line: 0, character: 5 } });
    expect(completion.result).toEqual(expect.arrayContaining([expect.objectContaining({ label: "block", insertTextFormat: 2 })]));
    const progress = client.waitForNotification("twigPlus/formatProgress");
    const formattingStarted = Date.now();
    const formatted = await client.request("textDocument/formatting", { textDocument: { uri }, options: { tabSize: 4, insertSpaces: true } });
    expect(Date.now() - formattingStarted).toBeLessThan(750);
    expect(formatted.result).toEqual(expect.any(Array));
    expect((await progress).params).toMatchObject({ uri, stage: "parse", status: "started" });
  }, 15_000);

  it("keeps defined completion, narrowing and closing-tag context consistent", async () => {
    const client = startClient();
    await client.request("initialize", { processId: process.pid, rootUri: null, capabilities: {}, workspaceFolders: [] });
    client.notify("initialized", {});
    client.notify("workspace/didChangeConfiguration", { settings: { twigPlus: { diagnostics: { unresolvedNameMode: "strict" } } } });
    const uri = "untitled:defined-narrowing.html.twig";
    const source = `{% if user is defined %}\n    <span>user is {{ user.name }}</span>\n{% endif %}`;
    const published = client.waitForNotification("textDocument/publishDiagnostics");
    client.notify("textDocument/didOpen", { textDocument: { uri, languageId: "twig", version: 1, text: source } });
    const diagnostics = await published;
    expect(diagnostics.params.diagnostics.filter((item: { code?: string }) => item.code === "unresolved-name")).toEqual([]);
    const definedOffset = source.indexOf("defined") + 2;
    const hover = await client.request("textDocument/hover", { textDocument: { uri }, position: positionAt(source, definedOffset) });
    expect(hover.result.contents.value).toContain("Twig test");

    const completionUri = "untitled:defined-completion.html.twig";
    const completionSource = `{% if user is def %}`;
    client.notify("textDocument/didOpen", { textDocument: { uri: completionUri, languageId: "twig", version: 1, text: completionSource } });
    const completion = await client.request("textDocument/completion", { textDocument: { uri: completionUri }, position: positionAt(completionSource, completionSource.indexOf("def") + 3) });
    expect(completion.result).toEqual(expect.arrayContaining([expect.objectContaining({ label: "defined" })]));

    const closingUri = "untitled:closing-completion.html.twig";
    const closingSource = `{% if user %}\n{% end %}`;
    client.notify("textDocument/didOpen", { textDocument: { uri: closingUri, languageId: "twig", version: 1, text: closingSource } });
    const closing = await client.request("textDocument/completion", { textDocument: { uri: closingUri }, position: positionAt(closingSource, closingSource.indexOf("end") + 3) });
    expect(closing.result).toEqual(expect.arrayContaining([expect.objectContaining({ label: "endif" })]));
  });

  it("provides Twig hover, signature help, and safe range formatting", async () => {
    const client = startClient();
    await client.request("initialize", { processId: process.pid, rootUri: null, capabilities: {}, workspaceFolders: [] });
    client.notify("initialized", {});
    const uri = "untitled:intelligence.html.twig";
    const source = `{% block body %}\n    <div>{{ range(1, 3) }}</div>\n{% endblock %}`;
    client.notify("textDocument/didOpen", { textDocument: { uri, languageId: "twig", version: 1, text: source } });
    const functionOffset = source.indexOf("range") + 2;
    const hover = await client.request("textDocument/hover", { textDocument: { uri }, position: positionAt(source, functionOffset) });
    expect(hover.result.contents.value).toContain("range(low");
    const signatureOffset = source.indexOf(", 3") + 2;
    const signature = await client.request("textDocument/signatureHelp", { textDocument: { uri }, position: positionAt(source, signatureOffset) });
    expect(signature.result.signatures[0].label).toContain("range(low");
    expect(signature.result.activeParameter).toBe(1);
    const line = 1;
    const formatted = await client.request("textDocument/rangeFormatting", {
      textDocument: { uri }, range: { start: { line, character: 4 }, end: { line, character: source.split("\n")[line].length } },
      options: { tabSize: 4, insertSpaces: true }
    });
    expect(formatted.result).toEqual(expect.any(Array));
  });

  it("publishes mapped diagnostics for invalid embedded JavaScript", async () => {
    const client = startClient();
    await client.request("initialize", { processId: process.pid, rootUri: null, capabilities: {}, workspaceFolders: [] });
    client.notify("initialized", {});
    const uri = "untitled:invalid-script.html.twig";
    const source = `<script>for (let i, i < 3; i++) {}</script>`;
    const published = client.waitForNotification("textDocument/publishDiagnostics");
    client.notify("textDocument/didOpen", { textDocument: { uri, languageId: "twig", version: 1, text: source } });
    const message = await published;
    expect(message.params.uri).toBe(uri);
    expect(message.params.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({
      source: "TwigPlus JavaScript",
      severity: 1
    })]));
    const warning = client.waitForNotification("window/showMessage");
    const started = Date.now();
    const formatting = await client.request("textDocument/formatting", {
      textDocument: { uri }, options: { tabSize: 4, insertSpaces: true }
    });
    expect(formatting.error).toMatchObject({
      code: -32803,
      message: expect.stringContaining("did not modify this document")
    });
    expect((await warning).params).toMatchObject({ type: 1, message: expect.stringContaining("did not modify this document") });
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("indexes workspace templates and removes deleted targets without stale definitions", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "twig-plus-lsp-"));
    const templates = path.join(temporaryDirectory, "templates");
    const macros = path.join(templates, "macros");
    await mkdir(macros, { recursive: true });
    const macroFile = path.join(macros, "forms.twig");
    const pageFile = path.join(templates, "page.twig");
    const pageSource = `{% import "macros/forms.twig" as forms %}{{ forms.input("email") }}`;
    await writeFile(macroFile, `{% macro input(name) %}{{ name }}{% endmacro %}`, "utf8");
    await writeFile(pageFile, pageSource, "utf8");
    const rootUri = pathToFileURL(temporaryDirectory).toString();
    const pageUri = pathToFileURL(pageFile).toString();
    const macroUri = pathToFileURL(macroFile).toString();
    const client = startClient();
    await client.request("initialize", { processId: process.pid, rootUri, capabilities: {}, workspaceFolders: [{ uri: rootUri, name: "fixture" }] });
    client.notify("initialized", {});
    client.notify("textDocument/didOpen", { textDocument: { uri: pageUri, languageId: "twig", version: 1, text: pageSource } });
    const position = { line: 0, character: pageSource.lastIndexOf("input") + 2 };
    const definition = await client.request("textDocument/definition", { textDocument: { uri: pageUri }, position });
    expect(definition.result).toMatchObject({ uri: macroUri });

    await unlink(macroFile);
    client.notify("workspace/didChangeWatchedFiles", { changes: [{ uri: macroUri, type: 3 }] });
    const missing = await client.request("textDocument/definition", { textDocument: { uri: pageUri }, position });
    expect(missing.result).toBeNull();
  });

  it("provides package-aware Symfony metadata v3 references without executing project code", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "twig-plus-symfony-"));
    const metadataDirectory = path.join(temporaryDirectory, ".twig-plus");
    await mkdir(metadataDirectory, { recursive: true });
    const referenceFile = path.join(temporaryDirectory, "references.yaml");
    await writeFile(referenceFile, "admin_users: /admin/users\nROLE_ADMIN: admin\napp: importmap\n", "utf8");
    await writeFile(path.join(metadataDirectory, "symfony-metadata.json"), JSON.stringify({
      schemaVersion: 3,
      providerId: "integration",
      generatedAt: 0,
      environment: {
        symfonyVersion: "7.4.14",
        packages: ["symfony/twig-bundle", "symfony/twig-bridge", "symfony/routing", "symfony/asset", "symfony/translation", "symfony/form", "symfony/security-core", "symfony/http-kernel", "symfony/asset-mapper"],
        packageVersions: { "symfony/twig-bridge": "7.4.14" },
        referenceCatalogsComplete: ["route", "asset", "translation", "form", "security", "fragment", "importmap"]
      },
      completions: [], templates: [], blocks: [], macros: [], contexts: [],
      references: {
        routes: [{ name: "admin_users", detail: "GET /admin/users", documentation: "Lists application users.", source: { path: "references.yaml", line: 0, character: 0 } }, "home"],
        assets: ["images/logo.svg"],
        translations: ["account.login"],
        forms: ["form_div_layout.html.twig"],
        security: [{ name: "ROLE_ADMIN", source: { path: "references.yaml", line: 1, character: 0 } }],
        fragments: ["dashboard_summary"],
        importmaps: [{ name: "app", source: { path: "references.yaml", line: 2, character: 0 } }]
      }
    }), "utf8");
    const rootUri = pathToFileURL(temporaryDirectory).toString();
    const client = startClient();
    await client.request("initialize", { processId: process.pid, rootUri, capabilities: {}, workspaceFolders: [{ uri: rootUri, name: "fixture" }] });
    client.notify("initialized", {});
    const uri = pathToFileURL(path.join(temporaryDirectory, "page.html.twig")).toString();
    const source = `{{ path('admin_') }} {{ asset('images/') }} {{ 'account.'|trans }} {{ is_granted('ROLE_') }} {{ controller('dashboard_') }} {{ importmap('ap') }} {{ access_dec }} {{ path('admin_users') }}`;
    client.notify("textDocument/didOpen", { textDocument: { uri, languageId: "twig", version: 1, text: source } });

    for (const [needle, label] of [["admin_", "admin_users"], ["images/", "images/logo.svg"], ["account.", "account.login"], ["ROLE_", "ROLE_ADMIN"], ["dashboard_", "dashboard_summary"], ["ap", "app"]]) {
      const offset = (needle === "ap" ? source.indexOf("'ap") + 1 : source.indexOf(needle)) + needle.length;
      const completion = await client.request("textDocument/completion", { textDocument: { uri }, position: positionAt(source, offset) });
      expect(completion.result).toEqual(expect.arrayContaining([expect.objectContaining({ label })]));
    }
    const callableCompletion = await client.request("textDocument/completion", {
      textDocument: { uri }, position: positionAt(source, source.indexOf("access_dec") + "access_dec".length)
    });
    expect(callableCompletion.result).toEqual(expect.arrayContaining([expect.objectContaining({ label: "access_decision" })]));
    expect(callableCompletion.result).not.toEqual(expect.arrayContaining([expect.objectContaining({ label: "form_flow_steps" })]));

    const routeOffset = source.lastIndexOf("admin_users") + 2;
    const hover = await client.request("textDocument/hover", { textDocument: { uri }, position: positionAt(source, routeOffset) });
    expect(hover.result?.contents?.value).toContain("Lists application users");
    const definition = await client.request("textDocument/definition", { textDocument: { uri }, position: positionAt(source, routeOffset) });
    expect(definition.result).toMatchObject({ uri: pathToFileURL(referenceFile).toString(), range: { start: { line: 0, character: 0 } } });

    client.notify("workspace/didChangeConfiguration", { settings: { twigPlus: { symfony: { reference: "off" } } } });
    const disabledUri = pathToFileURL(path.join(temporaryDirectory, "disabled.html.twig")).toString();
    const disabledSource = `{{ path('admin_') }}`;
    client.notify("textDocument/didOpen", { textDocument: { uri: disabledUri, languageId: "twig", version: 1, text: disabledSource } });
    const disabled = await client.request("textDocument/completion", {
      textDocument: { uri: disabledUri }, position: positionAt(disabledSource, disabledSource.indexOf("admin_") + 6)
    });
    expect(disabled.result).not.toEqual(expect.arrayContaining([expect.objectContaining({ label: "admin_users" })]));
  });

  it("degrades safely with a visible diagnostic for oversized documents", async () => {
    const client = startClient();
    await client.request("initialize", { processId: process.pid, rootUri: null, capabilities: {}, workspaceFolders: [] });
    client.notify("initialized", {});
    const uri = "untitled:oversized.twig";
    const diagnostics = client.waitForNotification("textDocument/publishDiagnostics");
    client.notify("textDocument/didOpen", {
      textDocument: { uri, languageId: "twig", version: 1, text: "x".repeat(2_000_001) }
    });
    const message = await diagnostics;
    expect(message.params).toMatchObject({ uri, diagnostics: [{ code: "document-too-large" }] });
  });
});

function startClient(): ProtocolClient {
  child = spawn(process.execPath, [path.resolve(process.cwd(), "packages/vscode/dist/server.js"), "--stdio"], { cwd: process.cwd(), stdio: "pipe" });
  return new ProtocolClient(child);
}

function positionAt(source: string, offset: number): { line: number; character: number } {
  const before = source.slice(0, offset).split("\n");
  return { line: before.length - 1, character: before[before.length - 1].length };
}

function decodeSemanticTokens(
  source: string,
  data: number[],
  legend: { tokenTypes: string[]; tokenModifiers: string[] }
): Array<{ text: string; type: string; modifiers: string[]; line: number; character: number }> {
  let line = 0;
  let character = 0;
  const lines = source.split("\n");
  const result = [];
  for (let index = 0; index < data.length; index += 5) {
    line += data[index];
    character = data[index] === 0 ? character + data[index + 1] : data[index + 1];
    const modifierBits = data[index + 4];
    result.push({
      text: lines[line].slice(character, character + data[index + 2]),
      type: legend.tokenTypes[data[index + 3]],
      modifiers: legend.tokenModifiers.filter((_, modifier) => (modifierBits & (1 << modifier)) !== 0),
      line,
      character
    });
  }
  return result;
}

class ProtocolClient {
  private buffer = Buffer.alloc(0);
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (message: any) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
  private readonly notificationWaiters = new Map<string, Array<{ resolve: (message: any) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>>();
  constructor(private readonly process: ChildProcessWithoutNullStreams) {
    process.stdout.on("data", (chunk) => { this.buffer = Buffer.concat([this.buffer, chunk]); this.drain(); });
    let stderr = "";
    process.stderr.on("data", (chunk) => { stderr += String(chunk); });
    process.on("error", (error) => this.rejectAll(error));
    // `close` fires after stdio closes, so the failure includes all stderr.
    process.on("close", (code, signal) => this.rejectAll(new Error(
      `Bundled language server exited before completing pending requests (code=${String(code)}, signal=${String(signal)}).${stderr ? `\n${stderr}` : ""}`
    )));
  }
  request(method: string, params: unknown): Promise<any> {
    const id = this.nextId++;
    this.send({ jsonrpc: "2.0", id, method, params });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} timed out.`)); }, 5000);
      this.pending.set(id, { resolve, reject, timer });
    });
  }
  notify(method: string, params: unknown): void { this.send({ jsonrpc: "2.0", method, params }); }
  waitForNotification(method: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${method} notification timed out.`)), 5000);
      const waiters = this.notificationWaiters.get(method) ?? [];
      waiters.push({ resolve, reject, timer }); this.notificationWaiters.set(method, waiters);
    });
  }
  private send(message: unknown): void {
    const body = JSON.stringify(message);
    this.process.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  }
  private drain(): void {
    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n"); if (headerEnd < 0) return;
      const length = Number(this.buffer.slice(0, headerEnd).toString().match(/Content-Length:\s*(\d+)/i)?.[1]);
      const start = headerEnd + 4; if (this.buffer.length < start + length) return;
      const message = JSON.parse(this.buffer.slice(start, start + length).toString());
      this.buffer = this.buffer.slice(start + length);
      if (typeof message.id !== "number") {
        const waiter = this.notificationWaiters.get(message.method)?.shift();
        if (waiter) { clearTimeout(waiter.timer); waiter.resolve(message); }
        continue;
      }
      const pending = this.pending.get(message.id); if (!pending) continue;
      clearTimeout(pending.timer); this.pending.delete(message.id); pending.resolve(message);
    }
  }
  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
    for (const waiters of this.notificationWaiters.values()) for (const waiter of waiters) { clearTimeout(waiter.timer); waiter.reject(error); }
    this.notificationWaiters.clear();
  }
}
