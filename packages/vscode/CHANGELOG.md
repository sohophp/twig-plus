# Changelog

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
