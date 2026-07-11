# TwigPlus Language Server

`@twig-plus/language-server` is the editor-neutral LSP implementation used by the TwigPlus VSCode extension.

It provides:

- incremental document synchronization with versioned AST/semantic caches
- scope-aware completion, definition, references, and rename
- cross-template macro, import, template, and inherited-block navigation
- structural and optional unresolved-name diagnostics
- document symbols and AST/CST-backed selection ranges
- CST-backed Twig formatting with embedded CSS and JavaScript support
- bounded document/workspace indexing with cancellation-aware reference scans

Run the standalone server over stdio after building:

```bash
npm run build --workspace packages/language-server
npm run start --workspace packages/language-server
```

The VSCode package bundles this entrypoint as `dist/server.js` and starts it through `vscode-languageclient`.
