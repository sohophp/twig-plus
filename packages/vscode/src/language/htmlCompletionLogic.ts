import { getLanguageService, newHTMLDataProvider, type CompletionItem } from "vscode-html-languageservice";
import { TextDocument } from "vscode-languageserver-textdocument";
import { createHtmlVirtualSource, getHtmlContextAtOffset, parseHybridDocument, type HybridDocument } from "@twig-plus/parser";

const htmlLanguageService = getLanguageService();
htmlLanguageService.setDataProviders(true, [
  newHTMLDataProvider("twig-plus-html-values", {
    version: 1.1,
    tags: [
      {
        name: "script",
        attributes: [{
          name: "type",
          values: ["module", "importmap", "text/javascript", "application/javascript", "application/json"]
            .map((name) => ({ name }))
        }]
      },
      {
        name: "link",
        attributes: [{
          name: "rel",
          values: ["stylesheet", "preload", "modulepreload", "icon", "canonical", "alternate", "manifest"]
            .map((name) => ({ name }))
        }]
      }
    ]
  })
]);

export function getHtmlCompletions(source: string, offset: number, hybridDocument?: HybridDocument): CompletionItem[] {
  const hybrid = hybridDocument ?? parseHybridDocument(source);
  const document = TextDocument.create("inmemory://twig-plus/document.html", "html", 1, createHtmlVirtualSource(hybrid));
  const closingMatch = source.slice(0, offset).match(/<\/([A-Za-z:-]*)$/);
  if (closingMatch) {
    const stack = hybrid.children
      .filter((node) => node.end <= offset)
      .reduce<string[]>((openTags, node) => {
        if (node.kind === "HtmlOpenTag" && node.tagName && !node.selfClosing) openTags.push(node.tagName);
        if (node.kind === "HtmlCloseTag" && node.tagName) {
          const index = openTags.lastIndexOf(node.tagName);
          if (index >= 0) openTags.splice(index, 1);
        }
        return openTags;
      }, []);
    const tagName = stack.at(-1);
    if (tagName && tagName.startsWith(closingMatch[1].toLowerCase())) {
      const start = offset - closingMatch[1].length;
      return [{
        label: tagName,
        detail: "Close current HTML element",
        insertText: `${tagName}>`,
        textEdit: {
          range: { start: document.positionAt(start), end: document.positionAt(offset) },
          newText: `${tagName}>`
        }
      }];
    }
  }
  const context = getHtmlContextAtOffset(hybrid, offset);
  if (context.kind === "script" || context.kind === "style") return [];
  if (context.kind === "html-text" && !/<\/[A-Za-z:-]*$/.test(source.slice(0, offset))) return [];
  return htmlLanguageService.doComplete(document, document.positionAt(offset), htmlLanguageService.parseHTMLDocument(document)).items;
}

export function getEmbeddedScriptCompletions(
  source: string,
  offset: number,
  hybridDocument?: HybridDocument
): CompletionItem[] {
  const hybrid = hybridDocument ?? parseHybridDocument(source);
  if (getHtmlContextAtOffset(hybrid, offset).kind !== "script") return [];
  const prefix = source.slice(0, offset);
  const identifier = prefix.match(/([A-Za-z_$][\w$]*)$/)?.[1] ?? "";
  const member = prefix.match(/console\.([A-Za-z_$][\w$]*)?$/)?.[1];
  if (member !== undefined) {
    return ["log", "warn", "error", "info", "debug"].filter((name) => name.startsWith(member)).map((name) => ({
      label: name,
      detail: `console.${name}`,
      insertText: name
    }));
  }
  return ["constructor", "console"].filter((name) => identifier && name.startsWith(identifier)).map((name) => ({
    label: name,
    detail: name === "constructor" ? "JavaScript class constructor" : "JavaScript console",
    insertText: name
  }));
}
