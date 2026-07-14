# Changelog

## Unreleased

- Added TypeScript-powered Go to Definition for local declarations and import aliases inside supported embedded JavaScript, while rejecting external, generated, unsupported MIME, and cross-script targets that cannot be mapped safely to Twig.
- Added embedded JavaScript Rename for local declarations and import aliases, including complete source-map validation, identifier checks, collision prevention, and native WorkspaceEdit Undo/Redo.

## 1.2.0 - 2026-07-14

- Added pinned Twig 3.0-3.28 source oracles, version-gated language facts, recoverable Hybrid incomplete-document handling, and structured fatal-failure accounting.
- Expanded optional Symfony references to forms, security, fragments, and importmaps with package-aware completion, Hover, navigation, safe diagnostics, and bounded static indexes.

- Added a version-aware shared Twig 3.28 language specification, role-aware semantic diagnostics, `defined` branch narrowing, safe unresolved-name mode, and generated language assets.
- Added atomic, Hybrid-guarded HTML closing with `twigPlus.editing.htmlTagClosing`; unsafe contexts delegate immediately to native typing, while Enter expansion and the deprecated boolean compatibility setting remain available.

- Made Hybrid the only user runtime parser and formatter path and removed the legacy parser runtime, compatibility facade, and shadow comparison.
- Returned ordinary braces, `>`, Backspace, Undo, and Redo to VS Code while preserving atomic Twig/HTML/CSS/JavaScript Enter behavior.
- Added Twig and embedded JavaScript Hover, Signature Help, and safe structure-aware Range Formatting.
- Reduced activation and large-workspace cost with language-only activation, debounced diagnostics, root-scoped template indexing, and reference prefiltering.
- Hardened embedded formatter placeholders and bounded optional Symfony metadata loading.
- Prevented JavaScript formatting from appending semicolons to Twig nodes and enabled test completion plus safe Twig control-tag Enter pairing inside scripts.
- Fixed the VS Code 1.90.2 Extension Host assertion to accept the editor's equivalent normalized quick-suggestion representation.

## 1.1.2 - 2026-07-13

- Fixed clean-checkout CI by building workspace package entrypoints before Vitest resolves cross-package imports.
- Added a CI assertion that proves the test command bootstraps correctly when `packages/parser/dist` does not exist.

## 1.1.1 - 2026-07-13

- Replaced the ad-hoc Symfony base template with a valid, formatter-idempotent Twig/HTML/CSS/JavaScript smoke fixture.
- Added an integration gate that formats the real example template and requires byte-for-byte idempotence.

## 1.1.0 - 2026-07-13

- Added standard `%`/space Twig completion triggers and an atomic Enter controller that inserts missing `end*` tags with native Undo/Redo semantics.
- Removed duplicate Hybrid formatting work, lazily loads Prettier/TypeScript only for embedded languages, and records real per-stage formatter timings.
- Added independently configurable, atomic HTML tag, Twig control-tag, and embedded CSS brace closing; all three are enabled by default.
- Added atomic JavaScript block closing on Enter and reduced noisy embedded JavaScript suggestions by suppressing incomplete arrow-body globals and deprioritizing DOM constants.
- Added immediate, script-context-only JavaScript `{}` pairing without enabling global brace pairing that would interfere with Twig delimiters.
- Added atomic Backspace pair deletion for empty JavaScript `{}` while delegating every non-matching deletion to VS Code.
- Fixed CSS Enter closing to scan the remaining style block and avoid inserting a second `}` when the opening rule already has a matching brace.
- Added native VS Code linked editing ranges for synchronized HTML opening and closing tag renames in Twig documents.
- Replaced asynchronous delimiter and Backspace rewriting with the stable native VS Code editing model; Twig completion is now owned by the Language Server and formatting reports structured stage timings.
- Removed client configuration roundtrips from the formatting critical path and verified the complete UI suite on the minimum VS Code 1.90.2 baseline.
- Fixed automatic `{% bl` tag suggestions, Backspace inside empty Twig delimiters, and single-step undo after deleting closing tags; formatting now reports validation and formatting stages in the status bar.
- Made invalid embedded formatting fail fast with a mapped diagnostic and a visible LSP request error while preserving the document transactionally.
- Added verified Extension Host result reports, explicit minimum/current VS Code runners, whitespace-control delimiter typing, Twig test completion, broader Twig 3.x catalogs, quick fixes, and optional Symfony metadata completion.
- Added themed JavaScript grammar embedding, callable snippets, parenthesis pairing, and TypeScript-powered completion for regular and module scripts inside Twig templates.
- Added embedded JavaScript syntax diagnostics and made formatting preserve documents with invalid script or style syntax.
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

- Immediate PHPStorm-style delimiter spacing remains intentionally deferred; native delimiter pairs, completion snippets, and formatting own this behavior without asynchronous document rewrites.
- Formatter behavior is intentionally PHPStorm-leaning but not yet byte-for-byte identical for every complex Twig/HTML/CSS/JS nesting pattern.
