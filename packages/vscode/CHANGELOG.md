# Changelog

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
