import * as path from "node:path";
import * as vscode from "vscode";
import { LanguageClient, State, TransportKind, type LanguageClientOptions, type ServerOptions } from "vscode-languageclient/node";
import { getTwigPlusOutput } from "../output";

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
  const output = getTwigPlusOutput();
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "twig" }, { scheme: "vscode-remote", language: "twig" }, { scheme: "untitled", language: "twig" }],
    outputChannel: output,
    synchronize: {
      configurationSection: ["twigPlus"],
      fileEvents: [
        vscode.workspace.createFileSystemWatcher("**/*.twig"),
        vscode.workspace.createFileSystemWatcher("**/.twig-plus/symfony-metadata.json"),
        vscode.workspace.createFileSystemWatcher("**/config/{packages,symfony/packages}/twig.{yaml,yml}"),
        vscode.workspace.createFileSystemWatcher("**/src/Twig/*.php")
      ]
    }
  };
  client = new LanguageClient("twigPlusLanguageServer", "TwigPlus Language Server", serverOptions, clientOptions);
  const formattingStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  context.subscriptions.push(formattingStatus);
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
  try {
    await client.start(); status = "running";
    let refreshTimer: NodeJS.Timeout | undefined;
    let refreshAttempts = 0;
    const refreshPhpContexts = async (): Promise<boolean> => {
      if (!client?.isRunning() || !(await vscode.commands.getCommands(true)).includes("phpCompanion.provideTwigInterop")) return false;
      let received = false;
      for (const folder of vscode.workspace.workspaceFolders ?? []) {
        const payload = await vscode.commands.executeCommand<unknown>("phpCompanion.provideTwigInterop", folder.uri);
        if (payload) { received = true; await client.sendNotification("twigPlus/updatePhpContexts", payload); }
      }
      return received;
    };
    context.subscriptions.push(vscode.commands.registerCommand("twigPlus._refreshPhpContexts", refreshPhpContexts));
    context.subscriptions.push(vscode.commands.registerCommand("twigPlus.provideSymfonyRouteRename", async (request: unknown): Promise<unknown> => {
      if (!client?.isRunning()) return { complete: false, edits: [] };
      try { return await client.sendRequest("twigPlus/symfonyRouteRenameEdits", request); }
      catch { return { complete: false, edits: [] }; }
    }));
    const scheduleRefresh = (): void => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshAttempts = 0;
      const run = (): void => {
        refreshTimer = setTimeout(() => {
          refreshTimer = undefined;
          void refreshPhpContexts().then((received) => {
            refreshAttempts += 1;
            if ((!received || refreshAttempts < 2) && refreshAttempts < 30 && client?.isRunning()) run();
          });
        }, refreshAttempts === 0 ? 150 : 2_000);
      };
      run();
    };
    const phpWatcher = vscode.workspace.createFileSystemWatcher("**/*.php");
    context.subscriptions.push(phpWatcher, phpWatcher.onDidCreate(scheduleRefresh), phpWatcher.onDidChange(scheduleRefresh), phpWatcher.onDidDelete(scheduleRefresh), { dispose: () => { if (refreshTimer) clearTimeout(refreshTimer); } });
    scheduleRefresh();
  }
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
