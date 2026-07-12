import * as path from "node:path";
import * as vscode from "vscode";
import { LanguageClient, State, TransportKind, type LanguageClientOptions, type ServerOptions } from "vscode-languageclient/node";

let client: LanguageClient | null = null;
let status: "stopped" | "starting" | "running" | "failed" = "stopped";

interface FormatProgress {
  requestId: string;
  uri: string;
  stage: "parse" | "twig" | "html" | "javascript" | "css" | "mapping" | "complete";
  elapsedMs: number;
  status: "started" | "completed" | "failed";
  message?: string;
}

export async function startTwigLanguageClient(context: vscode.ExtensionContext): Promise<void> {
  status = "starting";
  const serverModule = context.asAbsolutePath(path.join("dist", "server.js"));
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: { module: serverModule, transport: TransportKind.ipc, options: { execArgv: ["--nolazy", "--inspect=6010"] } }
  };
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "twig" }, { scheme: "untitled", language: "twig" }],
    synchronize: {
      configurationSection: ["twigPlus"],
      fileEvents: [
        vscode.workspace.createFileSystemWatcher("**/*.twig"),
        vscode.workspace.createFileSystemWatcher("**/.twig-plus/symfony-metadata.json")
      ]
    }
  };
  client = new LanguageClient("twigPlusLanguageServer", "TwigPlus Language Server", serverOptions, clientOptions);
  const formattingStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  const output = vscode.window.createOutputChannel("TwigPlus");
  context.subscriptions.push(formattingStatus);
  context.subscriptions.push(output);
  context.subscriptions.push(client.onNotification("twigPlus/formatProgress", (event: FormatProgress) => {
    output.appendLine(`[format ${event.requestId}] ${event.stage} ${event.status} ${event.elapsedMs.toFixed(1)}ms${event.message ? `: ${event.message}` : ""} (${event.uri})`);
    if (event.stage === "complete") {
      formattingStatus.hide();
      return;
    }
    formattingStatus.text = `$(sync~spin) TwigPlus: ${formatStageLabel(event.stage)}…`;
    formattingStatus.tooltip = `${event.message ?? "Formatting"} · ${event.elapsedMs.toFixed(1)}ms`;
    formattingStatus.show();
  }));
  context.subscriptions.push(client.onDidChangeState((event) => {
    status = event.newState === State.Running ? "running" : event.newState === State.Starting ? "starting" : "stopped";
  }));
  context.subscriptions.push({ dispose: () => { if (client?.isRunning()) void client.stop(); client = null; } });
  try { await client.start(); status = "running"; }
  catch (error) { status = "failed"; throw error; }
}

export async function stopTwigLanguageClient(): Promise<void> {
  if (client?.isRunning()) await client.stop();
  client = null;
  status = "stopped";
}

export function getTwigLanguageClientStatus(): string { return status; }

function formatStageLabel(stage: FormatProgress["stage"]): string {
  return ({ parse: "validating", twig: "formatting Twig", html: "formatting HTML", javascript: "formatting JavaScript", css: "formatting CSS", mapping: "mapping edits", complete: "complete" })[stage];
}
