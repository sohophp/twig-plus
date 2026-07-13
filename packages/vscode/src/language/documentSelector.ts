import type { DocumentSelector } from "vscode";

/** Twig documents supported by both the extension and the language server. */
export const TWIG_DOCUMENT_SELECTOR: DocumentSelector = [
  { language: "twig", scheme: "file" },
  { language: "twig", scheme: "untitled" }
];
