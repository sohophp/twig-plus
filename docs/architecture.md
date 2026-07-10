# TwigPlus Architecture

TwigPlus uses a monorepo layout so reusable core behavior can evolve separately from editor integrations.

## Packages

- `@twig-plus/parser`
  Lightweight Twig tokenization and structural analysis.
- `@twig-plus/formatter`
  Reusable formatter core built on top of the parser package.
- `twig-plus` in `packages/vscode`
  VSCode adapter layer with providers, contributes metadata, snippets, and grammar files.
- `@twig-plus/language-server`
  Placeholder package for future LSP work.

## Dependency Direction

- `parser` has no editor dependency.
- `formatter` depends on `parser`.
- `vscode` depends on `formatter` and `parser`.
- `language-server` is reserved to depend on `formatter` and `parser`.
