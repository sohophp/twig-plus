# Changelog

## 1.2.0 - 2026-07-14

- Removed the public parser-engine setting/command, compatibility facade, shadow comparison, old parser queries, and fatal fallback; Hybrid is now the only parser and formatter path.
- Hybrid failures now preserve the original document, return a structured failure, and write query/URI/reason details to the TwigPlus output.
- Existing user settings containing the removed parser-engine key are safely ignored and are not rewritten automatically.
- Added LSP Hover, Signature Help, safe Range Formatting, debounced diagnostics, and template-root-scoped indexing.
- Restored native VS Code ownership of ordinary typing and deletion while retaining safe atomic Enter enhancements.
- Fixed embedded formatting so Twig nodes do not acquire JavaScript semicolons, and completed `is defined` suggestions and `endif` Enter pairing inside scripts.
- Added pinned Twig 3.0-3.28 and Symfony 6.4-8.1 oracles, version-gated language facts, and package-aware Symfony references.
- Fixed the minimum-version Extension Host assertion to accept VS Code's equivalent normalized quick-suggestion representation.

## 1.1.2 - 2026-07-13

- Fixed clean CI test ordering so formatter tests no longer depend on stale local parser build output.

## 1.1.1 - 2026-07-13

- Stabilized `examples/basic-symfony/templates/base.html.twig` as the release smoke fixture and added byte-for-byte formatter idempotence coverage.

## 1.1.0 - 2026-07-13

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
