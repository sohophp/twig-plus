import * as path from "node:path";
import * as vscode from "vscode";
import { LanguageClient, State, TransportKind, type LanguageClientOptions, type ServerOptions } from "vscode-languageclient/node";

let client: LanguageClient | null = null;
let status: "stopped" | "starting" | "running" | "failed" = "stopped";

export async function startTwigLanguageClient(context: vscode.ExtensionContext): Promise<void> {
  status = "starting";
  const serverModule = context.asAbsolutePath(path.join("dist", "server.js"));
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: { module: serverModule, transport: TransportKind.ipc, options: { execArgv: ["--nolazy", "--inspect=6010"] } }
  };
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "twig" }, { scheme: "untitled", language: "twig" }],
    synchronize: { configurationSection: ["twigPlus"], fileEvents: vscode.workspace.createFileSystemWatcher("**/*.twig") }
  };
  client = new LanguageClient("twigPlusLanguageServer", "TwigPlus Language Server", serverOptions, clientOptions);
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
