# TwigPlus Monorepo

TwigPlus now uses an npm workspaces monorepo so the reusable formatter and parser can evolve independently from the VSCode extension.

## Workspace Layout

```txt
twig-plus/
├── docs/
├── examples/
├── packages/
│   ├── formatter/
│   ├── language-server/
│   ├── parser/
│   └── vscode/
└── tests/
```

## Packages

- `@twig-plus/parser`
  Lightweight Twig tokenization, structural analysis, template reference parsing, and diagnostics helpers.
- `@twig-plus/formatter`
  Reusable Twig formatter core intended for future CLI, Prettier plugin, or editor reuse.
- `twig-plus` in `packages/vscode`
  VSCode adapter layer with providers, contributes metadata, snippets, and grammar files.
- `@twig-plus/language-server`
  Runnable LSP server for semantic completion, navigation, references, rename, diagnostics, symbols, selection ranges, and formatting.

## Development

```bash
npm install
npm run build
npm test
```

## Formatting Baseline

- `.editorconfig` is included so Twig files default to 4-space indentation, closer to PHPStorm defaults.
- The VSCode extension also defaults `twigPlus.format.indentSize` to `4`.
- Auto-inserting closing Twig tags is intentionally off by default to match PHPStorm behavior more closely.

## VSCode Debugging

1. Open the repository root in VSCode
2. Run `npm install`
3. Run `npm run build`
4. Press `F5`
5. The Extension Development Host will launch from `packages/vscode`

## More

- Architecture notes: `docs/architecture.md`
- Extension usage notes: `packages/vscode/README.md`
- Example workspace: `examples/basic-symfony`
