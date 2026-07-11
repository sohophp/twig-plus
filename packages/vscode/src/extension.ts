import * as vscode from "vscode";
import { getHtmlContextAtOffset } from "@twig-plus/parser";

import { registerTwigCodeActionProvider } from "./diagnostics/codeActionProvider";
import { registerTwigCompletionProvider } from "./language/completionProvider";
import { registerHtmlCompletionProvider } from "./language/htmlCompletionProvider";
import { getTwigLanguageClientStatus, startTwigLanguageClient, stopTwigLanguageClient } from "./language/languageClient";
import { registerFallbackProviders } from "./language/fallbackProviders";
import {
  getHtmlAttributeQuoteAutoCloseEdit,
  getHtmlAutoCloseTagEdit,
  getEmbeddedBraceEnterEdit,
  getTwigAutoCloseEdit,
  getTwigAutoCloseBacktrack,
  getTwigEnterEdit,
  getTwigExpressionPairAutoCloseEdit,
  getTwigSpacingEdit
} from "./language/autoClose";
import { getConfiguredTemplateRoots } from "./language/templateConfig";
import { getCachedHybridDocument, getConfiguredParserEngine, registerHybridParserRuntime, reportRuntimeError } from "./language/parserRuntime";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  registerHybridParserRuntime(context);
  registerRecommendedSettingsCommand(context);
  registerTwigTagAutoCloseHandler(context);

  registerTwigCompletionProvider(context);
  registerHtmlCompletionProvider(context);
  registerTwigCodeActionProvider(context);
  try {
    await startTwigLanguageClient(context);
  } catch (error) {
    console.error("[TwigPlus] language server failed to start; using local fallback providers:", error);
    reportRuntimeError("Language server failed to start; local fallback providers are active", error);
    registerFallbackProviders(context);
    void vscode.window.showErrorMessage("TwigPlus language server failed to start. Local fallback features are active; see the TwigPlus output for details.");
  }
}

export async function deactivate(): Promise<void> { await stopTwigLanguageClient(); }

function registerRecommendedSettingsCommand(
  context: vscode.ExtensionContext
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("twigPlus.applyRecommendedSettings", async () => {
      await applyRecommendedSettings();

      void vscode.window.showInformationMessage(
        "TwigPlus recommended workspace settings were applied."
      );
    }),
    vscode.commands.registerCommand("twigPlus.showStatus", async () => {
      await showTwigPlusStatus(context);
    }),
    vscode.commands.registerCommand("twigPlus.selectParserEngine", async () => {
      await selectParserEngine();
    })
  );
}

async function selectParserEngine(): Promise<void> {
  const current = getConfiguredParserEngine();
  const choices = [
    { label: "Legacy", description: "Compatibility parser", engine: "legacy" as const },
    { label: "Hybrid Shadow", description: "Compare Hybrid CST while returning legacy results", engine: "hybrid-shadow" as const },
    { label: "Hybrid", description: "Default lossless CST/AST engine with automatic legacy fallback", engine: "hybrid" as const }
  ].map((choice) => ({ ...choice, picked: choice.engine === current }));
  const selected = await vscode.window.showQuickPick(choices, {
    title: "TwigPlus: Select Parser Engine",
    placeHolder: `Current: ${current}`
  });
  if (!selected) return;
  await vscode.workspace.getConfiguration("twigPlus.parser").update(
    "engine",
    selected.engine,
    vscode.workspace.workspaceFolders?.length
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global
  );
  void vscode.window.showInformationMessage(`TwigPlus parser engine: ${selected.engine}`);
}

async function applyRecommendedSettings(): Promise<void> {
  const config = vscode.workspace.getConfiguration();
  const twigLanguageSettings = config.get<Record<string, unknown>>("[twig]") ?? {};

  await config.update(
    "[twig]",
    {
      ...twigLanguageSettings,
      "editor.defaultFormatter": "sohophp.twig-plus",
      "editor.formatOnSave": true
    },
    vscode.ConfigurationTarget.Workspace
  );
  await config.update("twigPlus.format.enable", true, vscode.ConfigurationTarget.Workspace);
  await config.update(
    "twigPlus.format.profile",
    "phpstorm",
    vscode.ConfigurationTarget.Workspace
  );
}

async function showTwigPlusStatus(context: vscode.ExtensionContext): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  const config = vscode.workspace.getConfiguration();
  const twigLanguageSettings = config.get<Record<string, unknown>>("[twig]") ?? {};
  const formatConfig = vscode.workspace.getConfiguration("twigPlus.format");
  const completionConfig = vscode.workspace.getConfiguration("twigPlus.completion");
  const templateRoots = getConfiguredTemplateRoots();
  const document = editor?.document;
  const fileName = document ? document.uri.fsPath || document.uri.toString() : "(no active editor)";

  const lines = [
    `TwigPlus ${context.extension.packageJSON.version ?? "(unknown version)"}`,
    `Active file: ${fileName}`,
    `Language mode: ${document?.languageId ?? "(none)"}`,
    `Twig default formatter: ${String(twigLanguageSettings["editor.defaultFormatter"] ?? "(unset)")}`,
    `Twig format on save: ${String(twigLanguageSettings["editor.formatOnSave"] ?? "(unset)")}`,
    `twigPlus.format.enable: ${String(formatConfig.get("enable", true))}`,
    `twigPlus.format.profile: ${String(formatConfig.get("profile", "phpstorm"))}`,
    `twigPlus.completion.autoInsertClosingTag: ${String(
      completionConfig.get("autoInsertClosingTag", false)
    )}`,
    `twigPlus.parser.engine: ${getConfiguredParserEngine()}`,
    `TwigPlus language server: ${getTwigLanguageClientStatus()}`,
    `twigPlus.templates.roots: ${templateRoots.join(", ")}`
  ];

  const documentUri = await vscode.workspace.openTextDocument({
    language: "plaintext",
    content: lines.join("\n")
  });
  await vscode.window.showTextDocument(documentUri, { preview: true });
}

function registerTwigTagAutoCloseHandler(
  context: vscode.ExtensionContext
): void {
  let applyingEdit = false;

  registerTwigDeleteCommand(context, (value) => {
    applyingEdit = value;
  });

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      void handleTwigEditorAutoClose(event, () => applyingEdit, (value) => {
        applyingEdit = value;
      }).catch((error) => {
        console.error("[TwigPlus] auto-close handler failed:", error);
      });
    })
  );
}

function registerTwigDeleteCommand(
  context: vscode.ExtensionContext,
  setApplyingEdit: (value: boolean) => void
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("twigPlus.deleteLeft", async () => {
      const editor = vscode.window.activeTextEditor;
      const selection = editor?.selection;
      const shouldDeletePair = Boolean(
        editor &&
        editor.document.languageId === "twig" &&
        selection?.isEmpty &&
        hasDeletableEmptyPairAtCursor(editor, selection.active)
      );

      await vscode.commands.executeCommand("deleteLeft");

      if (!shouldDeletePair || !editor || !editor.selection.isEmpty) {
        return;
      }

      const cursor = editor.selection.active;
      const cursorOffset = editor.document.offsetAt(cursor);
      const nextCharacter = editor.document.getText().slice(cursorOffset, cursorOffset + 1);
      if (nextCharacter !== '"' && nextCharacter !== "'" && nextCharacter !== "}" && nextCharacter !== ")") {
        return;
      }

      setApplyingEdit(true);
      try {
        await editor.edit((editBuilder) => {
          editBuilder.delete(
            new vscode.Range(cursor, editor.document.positionAt(cursorOffset + 1))
          );
        });
      } finally {
        setApplyingEdit(false);
      }
    })
  );
}

async function ensureEmbeddedOpeningBracePair(
  editor: vscode.TextEditor,
  cursorOffset: number,
  setApplyingEdit: (value: boolean) => void
): Promise<boolean> {
  const cursor = editor.document.positionAt(cursorOffset);
  const hybrid = getCachedHybridDocument(editor.document);
  if (!hybrid) return false;
  const context = getHtmlContextAtOffset(hybrid, cursorOffset);
  if (context.kind !== "script" && context.kind !== "style") return false;
  const linePrefix = editor.document.lineAt(cursor.line).text.slice(0, cursor.character);
  const shouldSpace = context.kind === "script"
    ? /\bclass\s+[A-Za-z_$][\w$]*(?:\s+extends\s+[A-Za-z_$][\w$\.]*)?\{$/.test(linePrefix)
    : /\S\{$/.test(linePrefix);
  const addSpace = shouldSpace && !/\s\{$/.test(linePrefix);
  const addClosingBrace = editor.document.getText().slice(cursorOffset, cursorOffset + 1) !== "}";
  if (!addSpace && !addClosingBrace) return true;

  setApplyingEdit(true);
  try {
    const applied = await editor.edit((editBuilder) => {
      if (addSpace) {
        editBuilder.insert(editor.document.positionAt(cursorOffset - 1), " ");
      }
      if (addClosingBrace) {
        editBuilder.insert(editor.document.positionAt(cursorOffset), "}");
      }
    });
    if (applied) {
      const target = editor.document.positionAt(cursorOffset + (addSpace ? 1 : 0));
      editor.selection = new vscode.Selection(target, target);
    }
    return applied;
  } finally {
    setApplyingEdit(false);
  }
}

function hasDeletableEmptyPairAtCursor(
  editor: vscode.TextEditor,
  position: vscode.Position
): boolean {
  const document = editor.document;
  const offset = document.offsetAt(position);
  if (offset === 0) {
    return false;
  }
  const source = document.getText();
  const previous = source[offset - 1];
  const hybrid = getCachedHybridDocument(document);
  if (!hybrid) return false;
  const context = getHtmlContextAtOffset(hybrid, offset).kind;
  if ((previous === '"' || previous === "'") && source[offset] === previous) {
    return context === "attribute-value";
  }
  return previous === "{" && source[offset] === "}" &&
    (context === "script" || context === "style") ||
    previous === "(" && source[offset] === ")" && context === "script";
}

async function ensureEmbeddedParenthesisPair(
  editor: vscode.TextEditor,
  cursorOffset: number,
  setApplyingEdit: (value: boolean) => void
): Promise<boolean> {
  const hybrid = getCachedHybridDocument(editor.document);
  if (!hybrid || getHtmlContextAtOffset(hybrid, cursorOffset).kind !== "script") {
    return false;
  }
  if (editor.document.getText().slice(cursorOffset, cursorOffset + 1) === ")") {
    return true;
  }
  setApplyingEdit(true);
  try {
    const position = editor.document.positionAt(cursorOffset);
    const applied = await editor.edit((editBuilder) => editBuilder.insert(position, ")"));
    if (applied) {
      editor.selection = new vscode.Selection(position, position);
    }
    return applied;
  } finally {
    setApplyingEdit(false);
  }
}

async function insertAutoCloseTextAtCursor(
  editor: vscode.TextEditor,
  getEdit: (
    source: string,
    cursorOffset: number
  ) => { cursorOffsetDelta: number; insertText: string } | null,
  setApplyingEdit: (value: boolean) => void,
  explicitCursorOffset?: number
): Promise<boolean> {
  const cursorOffset = explicitCursorOffset ?? editor.document.offsetAt(editor.selection.active);
  const edit = getEdit(editor.document.getText(), cursorOffset);

  if (!edit) {
    return false;
  }

  setApplyingEdit(true);

  try {
    const applied = await editor.edit((editBuilder) => {
      editBuilder.insert(editor.document.positionAt(cursorOffset), edit.insertText);
    });

    if (!applied) {
      return false;
    }

    const cursor = editor.document.positionAt(cursorOffset + edit.cursorOffsetDelta);
    editor.selection = new vscode.Selection(cursor, cursor);
    return true;
  } finally {
    setApplyingEdit(false);
  }
}

async function handleTwigEditorAutoClose(
  event: vscode.TextDocumentChangeEvent,
  getApplyingEdit: () => boolean,
  setApplyingEdit: (value: boolean) => void
): Promise<void> {
  if (getApplyingEdit() || event.document.languageId !== "twig") {
    return;
  }

  if (event.contentChanges.length === 0) {
    return;
  }

  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.uri.toString() !== event.document.uri.toString()) {
    return;
  }

  const change = event.contentChanges[event.contentChanges.length - 1];
  const compactDelimiter = getCompactTwigDelimiterEdit(change.text);
  if (compactDelimiter) {
    setApplyingEdit(true);
    try {
      const start = event.document.positionAt(change.rangeOffset);
      const end = event.document.positionAt(change.rangeOffset + change.text.length);
      const applied = await editor.edit((editBuilder) => {
        editBuilder.replace(new vscode.Range(start, end), compactDelimiter.replacement);
      });
      if (applied) {
        const cursor = event.document.positionAt(
          change.rangeOffset + compactDelimiter.cursorOffset
        );
        editor.selection = new vscode.Selection(cursor, cursor);
      }
    } finally {
      setApplyingEdit(false);
    }
    return;
  }
  if (/^\r?\n[\t ]*$/.test(change.text)) {
    await handleTwigEnterBetweenTags(event, editor, change, setApplyingEdit);
    return;
  }

  const autoCloseStartOffset = getTwigAutoCloseStartOffset(event.document, change);
  if (autoCloseStartOffset === null) {
    if (
      await handleTypedCharacterAssist(
        editor,
        change.text,
        getTypedCursorOffset(change),
        setApplyingEdit
      )
    ) {
      return;
    }
    await handleTwigTokenSpacing(event, editor, change, setApplyingEdit);
    return;
  }

  const startOffset = autoCloseStartOffset;
  const startPosition = event.document.positionAt(startOffset);
  const currentRange = new vscode.Range(
    startPosition,
    event.document.positionAt(
      Math.min(startOffset + 5, event.document.getText().length)
    )
  );
  const currentText = event.document.getText(currentRange);

  const autoCloseEdit = getTwigAutoCloseEdit(currentText);
  if (!autoCloseEdit) {
    return;
  }

  setApplyingEdit(true);

  try {
    const applied = await editor.edit((editBuilder) => {
      editBuilder.replace(
        new vscode.Range(
          startPosition,
          event.document.positionAt(startOffset + autoCloseEdit.replaceLength)
        ),
        autoCloseEdit.replacement
      );
    });

    if (!applied) {
      return;
    }

    const cursor = editor.document.positionAt(startOffset + autoCloseEdit.cursorOffset);
    editor.selection = new vscode.Selection(cursor, cursor);
  } finally {
    setApplyingEdit(false);
  }
}

function getCompactTwigDelimiterEdit(
  text: string
): { replacement: string; cursorOffset: number } | null {
  if (text === "{{}}") return { replacement: "{{  }}", cursorOffset: 3 };
  if (text === "{%%}") return { replacement: "{%  %}", cursorOffset: 3 };
  if (text === "{##}") return { replacement: "{#  #}", cursorOffset: 3 };
  return null;
}

async function handleTypedCharacterAssist(
  editor: vscode.TextEditor,
  text: string,
  cursorOffset: number,
  setApplyingEdit: (value: boolean) => void
): Promise<boolean> {
  // IME composition commits multiple characters. Never inspect or rewrite them.
  if (!["_", "{", "{}", "(", "()", "=", ">"].includes(text)) {
    return false;
  }

  const typedCharacter = text === "{}" ? "{" : text === "()" ? "(" : text;

  if (typedCharacter === "_") {
    const hybrid = getCachedHybridDocument(editor.document);
    if (
      hybrid &&
      getHtmlContextAtOffset(
        hybrid,
        cursorOffset
      ).kind === "attribute-value"
    ) {
      await vscode.commands.executeCommand("editor.action.triggerSuggest");
    }
    return true;
  }

  if (typedCharacter === "{") {
    if (await ensureEmbeddedOpeningBracePair(editor, cursorOffset, setApplyingEdit)) {
      return true;
    }
    return insertAutoCloseTextAtCursor(
      editor,
      getTwigExpressionPairAutoCloseEdit,
      setApplyingEdit,
      cursorOffset
    );
  }

  if (typedCharacter === "(") {
    if (
      text === "()" ||
      await ensureEmbeddedParenthesisPair(editor, cursorOffset, setApplyingEdit)
    ) {
      return true;
    }
    return insertAutoCloseTextAtCursor(
      editor,
      getTwigExpressionPairAutoCloseEdit,
      setApplyingEdit,
      cursorOffset
    );
  }

  if (typedCharacter === "=") {
    const inserted = await insertAutoCloseTextAtCursor(
      editor,
      getHtmlAttributeQuoteAutoCloseEdit,
      setApplyingEdit,
      cursorOffset
    );
    if (inserted) {
      await vscode.commands.executeCommand("editor.action.triggerSuggest");
    }
    return inserted;
  }

  return insertAutoCloseTextAtCursor(
    editor,
    getHtmlAutoCloseTagEdit,
    setApplyingEdit,
    cursorOffset
  );
}

function getTypedCursorOffset(
  change: vscode.TextDocumentContentChangeEvent
): number {
  if (change.text === "{}" || change.text === "()") {
    return change.rangeOffset + 1;
  }
  return change.rangeOffset + change.text.length;
}

async function handleTwigTokenSpacing(
  event: vscode.TextDocumentChangeEvent,
  editor: vscode.TextEditor,
  change: vscode.TextDocumentContentChangeEvent,
  setApplyingEdit: (value: boolean) => void
): Promise<void> {
  if (!["}", "%", "#"].includes(change.text)) {
    return;
  }

  const cursor = editor.selection.active;
  const line = event.document.lineAt(cursor.line);
  const spacingEdit = getTwigSpacingEdit(line.text, cursor.character);
  if (!spacingEdit) {
    return;
  }

  setApplyingEdit(true);

  try {
    const applied = await editor.edit((editBuilder) => {
      editBuilder.replace(
        new vscode.Range(
          new vscode.Position(cursor.line, spacingEdit.tokenStart),
          new vscode.Position(cursor.line, spacingEdit.tokenEnd)
        ),
        spacingEdit.replacement
      );
    });

    if (!applied) {
      return;
    }

    const targetPosition = new vscode.Position(cursor.line, spacingEdit.cursorColumn);
    editor.selection = new vscode.Selection(targetPosition, targetPosition);
  } finally {
    setApplyingEdit(false);
  }
}

async function handleTwigEnterBetweenTags(
  event: vscode.TextDocumentChangeEvent,
  editor: vscode.TextEditor,
  change: vscode.TextDocumentContentChangeEvent,
  setApplyingEdit: (value: boolean) => void
): Promise<void> {
  const cursor = editor.selection.active;
  if (cursor.line === 0) {
    return;
  }

  const previousLine = event.document.lineAt(cursor.line - 1).text;
  const currentLine = event.document.lineAt(cursor.line).text;
  let enterEdit = getTwigEnterEdit(previousLine, currentLine, getIndentUnit(editor));
  if (!enterEdit) {
    const hybrid = getCachedHybridDocument(event.document);
    const previousLineEnd = event.document.lineAt(cursor.line - 1).range.end;
    const embeddedKind = hybrid
      ? getHtmlContextAtOffset(hybrid, event.document.offsetAt(previousLineEnd)).kind
      : "html-text";
    if (embeddedKind === "script" || embeddedKind === "style") {
      enterEdit = getEmbeddedBraceEnterEdit(previousLine, currentLine, getIndentUnit(editor));
    }
  }
  if (!enterEdit) {
    return;
  }

  const currentLineRange = event.document.lineAt(cursor.line).range;
  setApplyingEdit(true);

  try {
    const applied = await editor.edit((editBuilder) => {
      editBuilder.replace(currentLineRange, enterEdit.replacement);
    });

    if (!applied) {
      return;
    }

    const targetPosition = new vscode.Position(cursor.line, enterEdit.cursorColumn);
    editor.selection = new vscode.Selection(targetPosition, targetPosition);
  } finally {
    setApplyingEdit(false);
  }
}

function getIndentUnit(editor: vscode.TextEditor): string {
  const insertSpaces = editor.options.insertSpaces;
  const tabSize = Number(editor.options.tabSize) || 4;

  if (insertSpaces === false) {
    return "\t";
  }

  return " ".repeat(tabSize);
}

function getTwigAutoCloseStartOffset(
  document: vscode.TextDocument,
  change: vscode.TextDocumentContentChangeEvent
): number | null {
  const previousCharacter =
    change.rangeOffset > 0
      ? document.getText(
          new vscode.Range(
            document.positionAt(change.rangeOffset - 1),
            document.positionAt(change.rangeOffset)
          )
        )
      : "";
  const backtrack = getTwigAutoCloseBacktrack(change.text, previousCharacter);

  if (backtrack !== null) {
    return change.rangeOffset + backtrack;
  }

  if (change.text.length !== 1 || change.rangeOffset === 0) {
    return null;
  }

  const openingPair = document.getText(
    new vscode.Range(
      document.positionAt(change.rangeOffset - 1),
      document.positionAt(Math.min(change.rangeOffset + 2, document.getText().length))
    )
  );

  if (
    openingPair.startsWith("{%") ||
    openingPair.startsWith("{{") ||
    openingPair.startsWith("{#")
  ) {
    return change.rangeOffset - 1;
  }

  return null;
}
