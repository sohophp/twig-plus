# TwigPlus Architecture

TwigPlus uses a monorepo layout so reusable core behavior can evolve separately from editor integrations.

## Packages

- `@twig-plus/parser`
  Lossless HTML/Twig CST, tolerant Twig AST, semantic document/workspace models, and compatibility queries.
- `@twig-plus/formatter`
  Reusable formatter core built on top of the parser package.
- `twig-plus` in `packages/vscode`
  VSCode adapter layer with providers, contributes metadata, snippets, and grammar files.
- `@twig-plus/language-server`
  The editor-neutral LSP owner for semantic completion, navigation, references, rename, diagnostics, symbols, selection, and formatting.

## Dependency Direction

- `parser` has no editor dependency.
- `formatter` depends on `parser`.
- `vscode` depends on `formatter` and `parser`.
- `language-server` depends on `formatter` and `parser`; VSCode starts it through a standard language client and retains only adapter and embedded-language behavior.
