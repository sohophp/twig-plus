import * as vscode from "vscode";
import {
  FILTER_COMPLETIONS,
  FUNCTION_COMPLETIONS,
  TAG_COMPLETIONS,
  getTwigCompletionMatch,
  type StaticCompletionEntry,
  type TwigCompletionMatch
} from "./completionData";
import {
  collectTemplateCompletionCandidates,
  getTemplateReferenceMatch
} from "../project/templateCompletion";

export function registerTwigCompletionProvider(
  context: vscode.ExtensionContext
): void {
  const provider: vscode.CompletionItemProvider = {
    async provideCompletionItems(document, position) {
      const linePrefix = document.lineAt(position).text.slice(0, position.character);
      const templateMatch = getTemplateReferenceMatch(linePrefix);

      if (templateMatch) {
        return buildTemplateCompletionItems(document, position, templateMatch);
      }

      const match = getTwigCompletionMatch(linePrefix);

      if (!match.kind) {
        return [];
      }

      return buildCompletionItems(match);
    }
  };

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      { language: "twig" },
      provider,
      "%",
      "{",
      "|",
      "(",
      "'",
      "\"",
      "/"
    )
  );
}
function buildCompletionItems(
  match: TwigCompletionMatch
): vscode.CompletionItem[] {
  const entries =
    match.kind === "tag"
      ? TAG_COMPLETIONS
      : match.kind === "filter"
        ? FILTER_COMPLETIONS
        : FUNCTION_COMPLETIONS;

  return entries
    .filter((entry) => entry.label.toLowerCase().startsWith(match.prefix))
    .map((entry) => {
      const item = new vscode.CompletionItem(
        entry.label,
        match.kind === "tag"
          ? vscode.CompletionItemKind.Keyword
          : match.kind === "filter"
            ? vscode.CompletionItemKind.Operator
            : vscode.CompletionItemKind.Function
      );

      item.detail = entry.detail;
      item.documentation = new vscode.MarkdownString(entry.documentation);

      if (entry.insertText) {
        item.insertText = new vscode.SnippetString(entry.insertText);
      }

      if (match.kind === "filter") {
        item.insertText = entry.label;
      }

      return item;
    });
}

async function buildTemplateCompletionItems(
  document: vscode.TextDocument,
  position: vscode.Position,
  match: NonNullable<ReturnType<typeof getTemplateReferenceMatch>>
): Promise<vscode.CompletionItem[]> {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (!workspaceFolder) {
    return [];
  }

  const uris = await vscode.workspace.findFiles(
    new vscode.RelativePattern(workspaceFolder, "**/*.twig"),
    "**/{node_modules,dist,coverage}/**"
  );

  const relativePaths = uris.map((uri) =>
    vscode.workspace.asRelativePath(uri, false).replace(/\\/g, "/")
  );

  const candidates = collectTemplateCompletionCandidates(
    relativePaths,
    match.prefix
  );

  const prefixStart = position.character - match.prefix.length;
  const range = new vscode.Range(
    new vscode.Position(position.line, prefixStart),
    position
  );

  return candidates.map((candidate) => {
    const item = new vscode.CompletionItem(
      candidate,
      vscode.CompletionItemKind.File
    );

    item.detail = "Twig template";
    item.insertText = candidate;
    item.range = range;
    return item;
  });
}
