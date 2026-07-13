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
      renameProvider: { prepareProvider: true }, documentFormattingProvider: true
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
