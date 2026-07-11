# Changelog

## 1.1.0 - 2026-07-11

- Added a lossless mixed HTML/Twig CST, tolerant Twig AST, lexical semantic model, and lazy cross-template workspace model.
- Added the production TwigPlus language server and migrated VSCode semantic providers to LSP with local failure fallback.
- Added scope-aware completion, navigation, references, rename, diagnostics, symbols, selection ranges, and CST-backed formatting.
- Added bounded/cancellation-aware indexing, oversized-document degradation, CI release gates, real LSP/Extension Host tests, and verified VSIX packaging.

## 1.0.0 - 2026-07-09

- Added stable Twig + HTML mixed-document formatting with embedded CSS and JavaScript formatting.
- Added Twig tag, filter, and function completions plus bundled snippets.
- Added template path completions and `Go to Definition` for common Twig template reference tags.
- Added block outline support and block navigation across parent templates via `extends`.
- Added lightweight diagnostics for unclosed structures, missing templates, duplicate blocks, and empty output tags.
