# Changelog

## 1.1.0 - 2026-07-11

- Promoted the lossless Hybrid CST/Twig AST engine to the default with automatic legacy fallback.
- Added a bundled TwigPlus language server with semantic scope completion, cross-template macro/block navigation, references, rename, diagnostics, symbols, selection ranges, and CST-backed formatting.
- Added an experimental lossless HTML/Twig Hybrid AST with legacy, shadow-comparison, and verified hybrid parser modes.
- Routed structural IDE features and formatting through compatibility guards with automatic legacy fallback.
- Added corpus, incomplete-input, truncation-fuzz, formatter parity, and idempotence coverage for the migration.
- Added context-aware standard HTML tag, attribute, and value completions, including attributes separated by Twig branches.
- Added native Hybrid CST symbol/navigation queries, document-version caching, precise shadow differences, and a parser-engine selection command.

## 1.0.5

- Restored the Marketplace extension icon by declaring `assets/logo.png` in the VSCode package manifest and including it in the VSIX.

## 1.0.4

- Improved messy Twig/HTML formatting with pre-format normalization for broken Twig tokens, HTML tag boundaries, attribute assignment spacing, boolean attributes, self-closing tags, and adjacent HTML child nodes.
- Added safer Twig expression spacing for common filters, dot access, function calls, and multiline output filters.
- Added configurable Twig template roots for completion, diagnostics, and Go to Definition via `twigPlus.templates.roots`.
- Improved template diagnostics and quick fixes for missing templates.
- Reduced noisy TwigPlus completions in string and hash-key contexts inside Twig output expressions.

## 1.0.3

- Fixed the release package layout so TwigPlus loads Prettier from `dist/node_modules/prettier` instead of bundling Prettier ESM code into the extension entrypoint.
- Removed the large Marketplace icon from the VSIX package to keep the local package smaller while release packaging is being stabilized.
- Verified the packaged extension can load without `@twig-plus/parser`, `@twig-plus/formatter`, or Prettier activation errors.

## 1.0.2

- Fixed VSIX packaging by bundling formatter/parser/runtime code into `dist/extension.js` instead of publishing an extension that cannot activate.
- Added `TwigPlus: Show Status` to diagnose the active language mode, formatter settings, and TwigPlus configuration.
- Made TwigPlus commands register on startup as well as command/language activation.
- Fixed the recommended settings command title so it appears once as `TwigPlus: Apply Recommended Twig Settings`.

## 1.0.1

- Added PHPStorm-like HTML attribute quote typing: `<a href=` becomes `<a href="">` with the cursor inside the quotes.
- Added a workspace command: `TwigPlus: Apply Recommended Twig Settings`.
- Documented all TwigPlus configuration keys, default values, recommended formatter settings, and extension interop notes in English and Chinese.
- Expanded real Extension Host typing coverage for Twig delimiters, Twig expression pairs, HTML tags, and HTML attribute quotes.

## 1.0.0

- Added Twig + HTML mixed formatting with embedded CSS and JavaScript formatting.
- Added Twig tag, filter, and function completion with PHPStorm-aligned defaults.
- Added template path completion and definition support, including same-directory and bundle-style references.
- Added Twig block, macro, and set-capture structural analysis for outline, selection, and navigation helpers.
- Added formatter fixtures for real mixed Twig pages to stabilize whitespace, indentation, and script/style output.
- Added editor typing helpers for Twig paired delimiters and block-enter indentation behavior.

### Known limitations

- `{%` typing auto-expansion still depends on VSCode editor change event behavior and may not trigger consistently in every Extension Development Host build.
- Formatter behavior is intentionally PHPStorm-leaning but not yet byte-for-byte identical for every complex Twig/HTML/CSS/JS nesting pattern.
