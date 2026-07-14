import * as vscode from "vscode";

import { registerTwigCodeActionProvider } from "./diagnostics/codeActionProvider";
import { registerHtmlCompletionProvider } from "./language/htmlCompletionProvider";
import { getTwigLanguageClientStatus, startTwigLanguageClient, stopTwigLanguageClient } from "./language/languageClient";
import { registerFallbackProviders } from "./language/fallbackProviders";
import { getConfiguredTemplateRoots } from "./language/templateConfig";
import { registerHybridParserRuntime, reportRuntimeError } from "./language/parserRuntime";
import { registerTwigEnterController } from "./editing/enterController";
import { registerHtmlLinkedEditingProvider } from "./editing/linkedEditingProvider";
import { getHtmlTagClosingMode, registerHtmlOnTypeController } from "./editing/htmlOnType";
import { initializeTwigPlusOutput } from "./output";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  initializeTwigPlusOutput(context);
  registerHybridParserRuntime(context);
  registerCommands(context);
  registerTwigEnterController(context);
  registerHtmlOnTypeController(context);
  registerHtmlLinkedEditingProvider(context);
  registerHtmlCompletionProvider(context);
  registerTwigCodeActionProvider(context);

  void startTwigLanguageClient(context).catch((error) => {
    console.error("[TwigPlus] language server failed to start; using local fallback providers:", error);
    reportRuntimeError("Language server failed to start; local fallback providers are active", error);
    registerFallbackProviders(context);
    void vscode.window.showErrorMessage(
      "TwigPlus language server failed to start. Local fallback features are active; see the TwigPlus output for details."
    );
  });
}

export async function deactivate(): Promise<void> {
  await stopTwigLanguageClient();
}

function registerCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("twigPlus.applyRecommendedSettings", async () => {
      await applyRecommendedSettings();
      void vscode.window.showInformationMessage("TwigPlus recommended workspace settings were applied.");
    }),
    vscode.commands.registerCommand("twigPlus.showStatus", () => showTwigPlusStatus(context))
  );
}

async function applyRecommendedSettings(): Promise<void> {
  const config = vscode.workspace.getConfiguration();
  const twigLanguageSettings = config.get<Record<string, unknown>>("[twig]") ?? {};
  await config.update(
    "[twig]",
    {
      ...twigLanguageSettings,
      "editor.defaultFormatter": "sohophp.twig-plus",
      "editor.formatOnSave": true,
      "editor.quickSuggestions": { other: "on", comments: "off", strings: "on" }
    },
    vscode.ConfigurationTarget.Workspace
  );
  await config.update("twigPlus.format.enable", true, vscode.ConfigurationTarget.Workspace);
  await config.update("twigPlus.format.profile", "phpstorm", vscode.ConfigurationTarget.Workspace);
}

async function showTwigPlusStatus(context: vscode.ExtensionContext): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  const config = vscode.workspace.getConfiguration();
  const twigLanguageSettings = config.get<Record<string, unknown>>("[twig]") ?? {};
  const formatConfig = vscode.workspace.getConfiguration("twigPlus.format");
  const templateRoots = getConfiguredTemplateRoots();
  const document = editor?.document;
  const lines = [
    `TwigPlus ${context.extension.packageJSON.version ?? "(unknown version)"}`,
    `Active file: ${document ? document.uri.fsPath || document.uri.toString() : "(no active editor)"}`,
    `Language mode: ${document?.languageId ?? "(none)"}`,
    `Twig default formatter: ${String(twigLanguageSettings["editor.defaultFormatter"] ?? "(unset)")}`,
    `Twig format on save: ${String(twigLanguageSettings["editor.formatOnSave"] ?? "(unset)")}`,
    `Twig quick suggestions: ${JSON.stringify(twigLanguageSettings["editor.quickSuggestions"] ?? "(default)")}`,
    `twigPlus.format.enable: ${String(formatConfig.get("enable", true))}`,
    `twigPlus.format.profile: ${String(formatConfig.get("profile", "phpstorm"))}`,
    "Twig parser: Hybrid CST/AST",
    `twigPlus.editing.htmlTagClosing: ${document ? getHtmlTagClosingMode(document.uri) : "(no active document)"}`,
    `TwigPlus language server: ${getTwigLanguageClientStatus()}`,
    `twigPlus.templates.roots: ${templateRoots.join(", ")}`
  ];
  const documentUri = await vscode.workspace.openTextDocument({ language: "plaintext", content: lines.join("\n") });
  await vscode.window.showTextDocument(documentUri, { preview: true });
}
