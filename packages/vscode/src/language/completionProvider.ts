import * as vscode from "vscode";
import {
  CLOSING_TAG_COMPLETIONS,
  FILTER_COMPLETIONS,
  FUNCTION_COMPLETIONS,
  TAG_COMPLETIONS,
  getCompletionSortScore,
  getTwigCompletionMatch,
  type StaticCompletionEntry,
  type TwigCompletionMatch
} from "./completionData";
import {
  matchesCompletionQuery,
  sortCompletionEntries
} from "./completionLogic";
import { buildTwigTagInsertText } from "./snippetBuilder";
import {
  collectTemplateCompletionCandidates,
  getCompatibleContextAtOffset,
  getCompatibleCompletionContext,
  getHybridCompletionContext,
  getHybridTokenContextAtOffset,
  getTemplateReferenceMatch
} from "@twig-plus/parser";
import {
  findTwigWorkspacePaths,
  getConfiguredTemplateRoots
} from "./templateConfig";
import { getCachedHybridDocument, getConfiguredParserEngine, getParserQueryOptions } from "./parserRuntime";
import { TWIG_DOCUMENT_SELECTOR } from "./documentSelector";

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

      const fullBlockSnippet = buildFullBlockSnippetCompletion(
        document,
        position,
        linePrefix
      );
      if (fullBlockSnippet) {
        return [fullBlockSnippet];
      }

      const syntax = getConfiguredParserEngine() === "legacy" ? null : getCachedHybridDocument(document);
      const tokenContext = syntax
        ? getHybridTokenContextAtOffset(syntax, document.offsetAt(position))
        : getCompatibleContextAtOffset(document.getText(), document.offsetAt(position), getParserQueryOptions(document));
      const match = getTwigCompletionMatch(linePrefix);

      if (!match.kind || shouldSuppressCompletionForContext(match, tokenContext)) {
        return [];
      }

      return buildCompletionItems(document, position, match);
    }
  };

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      TWIG_DOCUMENT_SELECTOR,
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

function buildFullBlockSnippetCompletion(
  document: vscode.TextDocument,
  position: vscode.Position,
  linePrefix: string
): vscode.CompletionItem | null {
  const match = linePrefix.match(/(?:^|\s)(twig-(?:b(?:l(?:o(?:c(?:k)?)?)?)?)?)$/i);
  if (!match) {
    return null;
  }

  const source = document.getText();
  const offset = document.offsetAt(position);
  if (
    getCompatibleContextAtOffset(
      source,
      offset,
      getParserQueryOptions(document)
    ).kind !== "html"
  ) {
    return null;
  }

  const typedPrefix = match[1];
  const item = new vscode.CompletionItem(
    "twig-block",
    vscode.CompletionItemKind.Snippet
  );
  item.detail = "Twig block snippet";
  item.documentation = new vscode.MarkdownString(
    "Insert a complete Twig block / endblock pair."
  );
  item.insertText = new vscode.SnippetString(
    "{% block ${1:name} %}\n\t$0\n{% endblock %}"
  );
  item.range = new vscode.Range(
    new vscode.Position(position.line, position.character - typedPrefix.length),
    position
  );
  item.filterText = "twig-block";
  return item;
}

function shouldSuppressCompletionForContext(
  match: TwigCompletionMatch,
  context: ReturnType<typeof getCompatibleContextAtOffset>
): boolean {
  if (context.kind === "comment" || context.stringLike || context.hashKeyLike) {
    return true;
  }

  if (context.kind === "tag") {
    return match.kind !== "tag";
  }

  if (context.kind === "output") {
    return match.kind === "tag";
  }

  return true;
}
function buildCompletionItems(
  document: vscode.TextDocument,
  position: vscode.Position,
  match: TwigCompletionMatch
): vscode.CompletionItem[] {
  const config = vscode.workspace.getConfiguration("twigPlus");
  const autoInsertClosingTag = config.get<boolean>(
    "completion.autoInsertClosingTag",
    false
  );
  const range = new vscode.Range(
    new vscode.Position(position.line, match.replaceStartOffset),
    position
  );

  if (match.kind === "tag") {
    return buildTagCompletionItems(
      document,
      position,
      match,
      range,
      autoInsertClosingTag
    );
  }

  const entries =
    match.kind === "filter" ? FILTER_COMPLETIONS : FUNCTION_COMPLETIONS;

  return entries
    .filter((entry) => matchesCompletionQuery(entry.label, match.prefix))
    .sort((left, right) =>
      getCompletionSortScore(
        left.label,
        match.prefix,
        left.priority ?? 0
      ).localeCompare(
        getCompletionSortScore(
          right.label,
          match.prefix,
          right.priority ?? 0
        )
      )
    )
    .map((entry) => {
      const item = new vscode.CompletionItem(
        entry.label,
        match.kind === "filter"
          ? vscode.CompletionItemKind.Operator
          : vscode.CompletionItemKind.Function
      );

      item.detail = entry.detail;
      item.documentation = new vscode.MarkdownString(entry.documentation);
      item.range = range;

      if (entry.insertText) {
        item.insertText = new vscode.SnippetString(entry.insertText);
      }

      if (match.kind === "filter") {
        item.insertText = entry.label;
      }

      item.sortText = `0-${getCompletionSortScore(
        entry.label,
        match.prefix,
        entry.priority ?? 0
      )}`;

      return item;
    });
}

function buildTagCompletionItems(
  document: vscode.TextDocument,
  position: vscode.Position,
  match: TwigCompletionMatch,
  range: vscode.Range,
  autoInsertClosingTag: boolean
): vscode.CompletionItem[] {
  const syntax = getConfiguredParserEngine() === "legacy" ? null : getCachedHybridDocument(document);
  const completionContext = syntax
    ? getHybridCompletionContext(syntax, document.offsetAt(position))
    : getCompatibleCompletionContext(document.getText(), document.offsetAt(position), getParserQueryOptions(document));
  const baseIndent = document.lineAt(position.line).text.match(/^\s*/)?.[0] ?? "";
  const indentUnit = getIndentUnit();
  const openingItems = sortCompletionEntries(TAG_COMPLETIONS, match.prefix)
    .filter((entry) =>
      shouldIncludeTagEntry(
        entry.label,
        match.prefix,
        match.preferClosing,
        completionContext.allowedMiddleTags
      )
    )
    .map((entry) => {
      const item = new vscode.CompletionItem(
        entry.label,
        vscode.CompletionItemKind.Keyword
      );

      item.detail = entry.detail;
      item.documentation = new vscode.MarkdownString(entry.documentation);
      item.range = range;

      if (entry.insertText) {
        item.insertText = new vscode.SnippetString(
          buildTwigTagInsertText(entry, autoInsertClosingTag, baseIndent, indentUnit)
        );
      }

      item.sortText = `${match.preferClosing ? "1" : "0"}-${getCompletionSortScore(
        entry.label,
        match.prefix,
        entry.priority ?? 0
      )}`;
      return item;
    });

  const closingItems = buildClosingTagCompletionItems(
    match,
    range,
    completionContext.preferredClosingTags
  );

  return match.preferClosing
    ? [...closingItems, ...openingItems]
    : [...openingItems, ...closingItems];
}

function buildClosingTagCompletionItems(
  match: TwigCompletionMatch,
  range: vscode.Range,
  preferredClosingTags: string[]
): vscode.CompletionItem[] {
  const items: vscode.CompletionItem[] = [];
  const closingTags = [
    ...preferredClosingTags,
    ...(match.prefix ? CLOSING_TAG_COMPLETIONS : [])
  ].filter((tag, index, tags) => tags.indexOf(tag) === index);

  for (const [index, closingTag] of closingTags.entries()) {
    const normalizedPrefix = match.prefix.toLowerCase();
    if (
      normalizedPrefix &&
      !matchesTagQuery(closingTag, normalizedPrefix)
    ) {
      continue;
    }

    const item = new vscode.CompletionItem(
      closingTag,
      vscode.CompletionItemKind.Keyword
    );

    item.detail = "Twig closing tag";
    item.documentation = new vscode.MarkdownString(
      `Insert \`${closingTag}\` for the current Twig block.`
    );
    item.insertText = closingTag;
    item.filterText = closingTag;
    item.range = range;
    item.sortText = `${match.preferClosing ? "0" : "1"}-${String(index).padStart(
      3,
      "0"
    )}-${getCompletionSortScore(closingTag, match.prefix, 120)}`;
    items.push(item);
  }

  return items;
}

function matchesTagQuery(label: string, query: string): boolean {
  return matchesCompletionQuery(label, query);
}

function getIndentUnit(): string {
  const editor = vscode.window.activeTextEditor;
  const insertSpaces = editor?.options.insertSpaces;
  const tabSize = Number(editor?.options.tabSize) || 4;

  if (insertSpaces === false) {
    return "\t";
  }

  return " ".repeat(tabSize);
}

function shouldIncludeTagEntry(
  label: string,
  query: string,
  preferClosing: boolean,
  allowedMiddleTags: string[]
): boolean {
  if (!matchesTagQuery(label, query)) {
    return false;
  }

  if (label === "else" || label === "elseif" || label === "empty") {
    return allowedMiddleTags.includes(label);
  }

  if (preferClosing && (label === "if" || label === "for" || label === "block")) {
    return query.length <= 1;
  }

  return true;
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

  const relativePaths = await findTwigWorkspacePaths(workspaceFolder);
  const currentWorkspacePath = vscode.workspace
    .asRelativePath(document.uri, false)
    .replace(/\\/g, "/");
  const templateRoots = getConfiguredTemplateRoots();

  const candidates = collectTemplateCompletionCandidates(
    relativePaths,
    match.prefix,
    currentWorkspacePath,
    templateRoots
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
