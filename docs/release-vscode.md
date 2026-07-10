# TwigPlus VSCode Release Guide

This guide covers the first stable Marketplace release flow for the `TwigPlus` VSCode extension.

## Prerequisites

- A clean local build: `npm run build`
- Passing tests: `npm test`
- Marketplace publisher access for `sohophp`
- `vsce` login completed once:

```bash
npx @vscode/vsce login sohophp
```

## Local Packaging

From the workspace root:

```bash
npm run package:vsix --workspace packages/vscode
```

This will:

1. vendor workspace runtime packages into `packages/vscode/node_modules/@twig-plus`
2. package the extension without resolving external workspace dependencies
3. create a `.vsix` file inside `packages/vscode`

## Marketplace Publish

From the workspace root:

```bash
npm run publish:marketplace --workspace packages/vscode
```

## Pre-publish Verification

- Confirm formatter works in `Extension Development Host`
- Confirm Twig completion works for `{% if %}`, `endblock`, and template path references
- Confirm template navigation works for `extends`, `include`, `embed`, `import`, and `from`
- Confirm `Expand Selection` grows through Twig tag, Twig block, and surrounding HTML node
- Confirm real-page formatter fixtures still pass

## Notes

- The extension package is the Marketplace artifact; the monorepo root is not published
- `packages/language-server` remains a future placeholder and is not part of the first release
- The `{%` typing hook is still a known limitation across some VSCode builds, so release notes should keep that caveat until the input behavior is fully stabilized
