# TwigPlus VSCode Release Guide

This guide covers the Marketplace release flow for the `TwigPlus` VSCode extension.

## Prerequisites

- A clean local build: `npm run build`
- Passing tests: `npm test`
- Marketplace publisher access for `sohophp`
- `vsce` login completed once:

```bash
npx @vscode/vsce login sohophp
```

- If you want to inspect package contents without a global install:

```bash
npm run vsce:ls --workspace packages/vscode
```

## Recommended User Settings

TwigPlus contributes itself as the default formatter for the `twig` language. For the recommended PHPStorm-like workflow, users can add:

```json
{
  "[twig]": {
    "editor.defaultFormatter": "sohophp.twig-plus",
    "editor.formatOnSave": true
  },
  "twigPlus.format.enable": true,
  "twigPlus.format.profile": "phpstorm"
}
```

Users can also run this Command Palette action after installation:

```text
TwigPlus: Apply Recommended Twig Settings
```

The command writes the recommended settings to the current workspace. The extension does not silently modify global settings on install.

## Versioning

- Bump `packages/vscode/package.json` for Marketplace releases.
- Keep `packages/vscode/CHANGELOG.md` updated before packaging.
- Run `npm install --package-lock-only` from the workspace root after a version bump so `package-lock.json` records the package snapshot.

## Local Packaging

From the workspace root:

```bash
npm run package:vsix --workspace packages/vscode
```

This will:

1. run the VSCode prepublish step
2. verify `dist/extension.js` contains the bundled runtime formatter/parser code
3. copy the explicitly externalized runtime dependencies into `dist/node_modules`
4. create the versioned `.vsix` inside `artifacts/vsix/`

## Marketplace Publish

From the workspace root:

```bash
npm run publish:marketplace --workspace packages/vscode
```

If you need to login manually, use:

```bash
npx @vscode/vsce login sohophp
```

## Pre-publish Verification

- Confirm formatter works in `Extension Development Host`
- Confirm Twig completion works for `{% if %}`, `endblock`, and template path references
- Confirm template navigation works for `extends`, `include`, `embed`, `import`, and `from`
- Confirm stable editing behavior:
  - delimiter text is not asynchronously rewritten after typing
  - `{% blo` provides `block` through normal quick suggestions and Ctrl+Space
  - Enter after an unpaired `{% block name %}` inserts one atomic `{% endblock %}` edit with symmetric Undo/Redo
  - Backspace, Undo, and Redo use VS Code native transactions
  - JavaScript strings containing `{{` do not receive duplicate closing braces
- Confirm `Expand Selection` grows through Twig tag, Twig block, and surrounding HTML node
- Confirm real-page formatter fixtures still pass
- Confirm `npm run vscode:test --workspace packages/vscode` passes in a real Extension Host
- Confirm the VSIX contains both `dist/extension.js` and `dist/server.js`
- Run `npm run vscode:test:packaged --workspace packages/vscode` to activate and exercise the unpacked release artifact

## Notes

- The extension package is the Marketplace artifact; the monorepo root is not published
- `packages/language-server` is bundled as `dist/server.js` and started by the VSCode language client
- The current logo is valid, but it is larger than ideal for Marketplace packaging; reducing it to a smaller square PNG later will shrink the VSIX
