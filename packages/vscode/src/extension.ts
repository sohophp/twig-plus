import * as vscode from "vscode";

import { registerTwigCodeActionProvider } from "./diagnostics/codeActionProvider";
import { registerTwigDiagnosticProvider } from "./diagnostics/diagnosticProvider";
import { formatTwig, type FormatterOptions } from "@twig-plus/formatter";
import { registerTwigCompletionProvider } from "./language/completionProvider";
import { registerTwigDefinitionProvider } from "./language/definitionProvider";
import { registerTwigDocumentSymbolProvider } from "./language/documentSymbolProvider";
import { registerTwigSelectionRangeProvider } from "./language/selectionRangeProvider";
import {
  getHtmlAttributeQuoteAutoCloseEdit,
  getHtmlAutoCloseTagEdit,
  getTwigAutoCloseEdit,
  getTwigAutoCloseEditAtOffset,
  getTwigAutoCloseBacktrack,
  getTwigEnterEdit,
  getTwigExpressionPairAutoCloseEdit,
  getTwigSpacingEdit
} from "./language/autoClose";
import { getConfiguredTemplateRoots } from "./language/templateConfig";

export function activate(context: vscode.ExtensionContext): void {
  registerRecommendedSettingsCommand(context);
  registerTwigTagAutoCloseHandler(context);

  const provider: vscode.DocumentFormattingEditProvider = {
    async provideDocumentFormattingEdits(document) {
      const config = vscode.workspace.getConfiguration("twigPlus");
      const enabled = config.get<boolean>("format.enable", true);

      if (!enabled) {
        return [];
      }

      const source = document.getText();
      const options: FormatterOptions = {
        profile: config.get<"phpstorm" | "compact">(
          "format.profile",
          "phpstorm"
        ),
        indentSize: config.get<number>("format.indentSize", 4),
        printWidth: config.get<number>("format.printWidth", 100),
        useTabs: config.get<boolean>("format.useTabs", false),
        twigTagSpacing: config.get<boolean>("format.twigTagSpacing", true),
        htmlAttributeWrap: config.get<"preserve" | "auto" | "force">(
          "format.htmlAttributeWrap",
          "auto"
        ),
        preserveSingleLineBlocks: config.get<boolean>(
          "format.preserveSingleLineBlocks",
          true
        ),
        lineBreakAfterTwigControlTag: config.get<boolean>(
          "format.lineBreakAfterTwigControlTag",
          true
        )
      };
      const formatted = await formatTwig(source, options);

      if (formatted === source) {
        return [];
      }

      const lastLine = document.lineAt(document.lineCount - 1);
      const range = new vscode.Range(
        new vscode.Position(0, 0),
        lastLine.range.end
      );

      return [vscode.TextEdit.replace(range, formatted)];
    }
  };

  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider(
      { language: "twig" },
      provider
    )
  );

  registerTwigCompletionProvider(context);
  registerTwigDefinitionProvider(context);
  registerTwigDocumentSymbolProvider(context);
  registerTwigSelectionRangeProvider(context);
  registerTwigDiagnosticProvider(context);
  registerTwigCodeActionProvider(context);
}

export function deactivate(): void {}

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
    })
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

  registerTwigTypeCommandHandler(context, () => applyingEdit, (value) => {
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

function registerTwigTypeCommandHandler(
  context: vscode.ExtensionContext,
  getApplyingEdit: () => boolean,
  setApplyingEdit: (value: boolean) => void
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("type", async (args: { text: string }) => {
      await vscode.commands.executeCommand("default:type", args);

      if (getApplyingEdit() || !["%", "{", "#", "(", ">", "="].includes(args.text)) {
        return;
      }

      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== "twig") {
        return;
      }

      if (args.text === "{" || args.text === "%" || args.text === "#") {
        const normalized = await normalizeTwigDelimiterAtCursor(
          editor,
          setApplyingEdit
        );
        if (normalized || args.text !== "{") {
          return;
        }
      }

      if (args.text === "(" || args.text === "{") {
        await insertAutoCloseTextAtCursor(
          editor,
          getTwigExpressionPairAutoCloseEdit,
          setApplyingEdit
        );
        return;
      }

      if (args.text === "=") {
        await insertAutoCloseTextAtCursor(
          editor,
          getHtmlAttributeQuoteAutoCloseEdit,
          setApplyingEdit
        );
        return;
      }

      await insertAutoCloseTextAtCursor(
        editor,
        getHtmlAutoCloseTagEdit,
        setApplyingEdit
      );
    })
  );
}

async function insertAutoCloseTextAtCursor(
  editor: vscode.TextEditor,
  getEdit: (
    source: string,
    cursorOffset: number
  ) => { cursorOffsetDelta: number; insertText: string } | null,
  setApplyingEdit: (value: boolean) => void
): Promise<void> {
  const cursorOffset = editor.document.offsetAt(editor.selection.active);
  const edit = getEdit(editor.document.getText(), cursorOffset);

  if (!edit) {
    return;
  }

  setApplyingEdit(true);

  try {
    const applied = await editor.edit((editBuilder) => {
      editBuilder.insert(editor.document.positionAt(cursorOffset), edit.insertText);
    });

    if (!applied) {
      return;
    }

    const cursor = editor.document.positionAt(cursorOffset + edit.cursorOffsetDelta);
    editor.selection = new vscode.Selection(cursor, cursor);
  } finally {
    setApplyingEdit(false);
  }
}

async function normalizeTwigDelimiterAtCursor(
  editor: vscode.TextEditor,
  setApplyingEdit: (value: boolean) => void
): Promise<boolean> {
  const cursorOffset = editor.document.offsetAt(editor.selection.active);
  const autoCloseEdit = getTwigAutoCloseEditAtOffset(
    editor.document.getText(),
    cursorOffset
  );

  if (!autoCloseEdit) {
    return false;
  }

  const startPosition = editor.document.positionAt(autoCloseEdit.startOffset);
  setApplyingEdit(true);

  try {
    const applied = await editor.edit((editBuilder) => {
      editBuilder.replace(
        new vscode.Range(
          startPosition,
          editor.document.positionAt(
            autoCloseEdit.startOffset + autoCloseEdit.replaceLength
          )
        ),
        autoCloseEdit.replacement
      );
    });

    if (!applied) {
      return false;
    }

    const cursor = editor.document.positionAt(
      autoCloseEdit.startOffset + autoCloseEdit.cursorOffset
    );
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
  if (change.text === "\n" || change.text === "\r\n") {
    await handleTwigEnterBetweenTags(event, editor, change, setApplyingEdit);
    return;
  }

  const autoCloseStartOffset = getTwigAutoCloseStartOffset(event.document, change);
  if (autoCloseStartOffset === null) {
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
  const enterEdit = getTwigEnterEdit(previousLine, currentLine, getIndentUnit(editor));
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
