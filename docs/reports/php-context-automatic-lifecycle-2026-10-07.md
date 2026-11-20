# Automatic PHP context lifecycle qualification

Date: 2026-10-07. Follow-up to [definition provenance and namespaces](php-context-definitions-2026-10-07.md). Core server `0680ad5a`, TwigPlus server `0ca45a6a`, and the extension bundle remain unchanged; this batch changes test fixtures and evidence only.

VS Code 1.140.0 on Linux x64 ran the three actual source extensions with PHP semantic targets 7.2 and 8.5 in both onDemand and progressive indexing modes. All four runs passed 33 checks each (132 total), covering both plain and namespaced templates. Thirty observed stages per run verify exact getter definitions, complete method/property completion names and type details, Hover, unsaved return-type/getter/Controller changes, Undo/Redo, discarded edits, reopening, retained-buffer authority, disk watchers, never-opened type and Controller creation/deletion/recreation, and final results after nine rapid edits. Each stage retains the original five-second convergence bound. Normal assertions do not invoke a manual context refresh or request a PHP payload directly.

Two fixture assumptions were corrected with independent evidence. Closing an editor tab may retain an open TextDocument, whose content correctly remains authoritative after its disk file is removed. When the semantic provider returns no members, VS Code may return document-word Text completions; an off/restore control removed/recreated these candidates while PHP types and Twig definitions were already withdrawn. Only the isolated lifecycle fixture disables editor.wordBasedSuggestions. No production code or user profile setting was changed. All five original failed runs remain archived in the coordinating PHP Companion report.

The complete producer stdio file passed eight cases with explicit didClose and four cancellation scenarios. A watcher test callback initially failed TypeScript with TS2322; after discarding its boolean return, scoped typecheck, ESLint and all eight cases passed again. The default precision/Rename host passed its original 25 checks without disabling word completions. The four pre-existing dirty TwigPlus files retain their original hashes. Earlier 426-test qualification remains tied to its original frozen inputs; no product changes required repeating it here.

After building all three source extensions, run from TwigPlus:

```sh
TWIG_PLUS_TEST_PHP_CONTEXT_LIFECYCLE=1 \
TWIG_PLUS_TEST_INDEXING_MODE=onDemand \
TWIG_PLUS_TEST_PHP_VERSION=8.5 \
TWIG_PLUS_TEST_PHP_CORE_PATH=/path/to/php-companion \
TWIG_PLUS_TEST_PHP_SYMFONY_PATH=/path/to/php-companion/packages/php-companion-symfony \
TWIG_PLUS_TEST_VSCODE_EXECUTABLE=/path/to/vscode/code \
TWIG_PLUS_PHP_DEFINITION_REPORT=/tmp/unique-php-context-lifecycle-report.json \
xvfb-run -a node packages/vscode/test/extension/runPhpContextTest.js
```

Repeat with progressive and target 7.2 for the other combinations, using unused report paths. The fixture uses a temporary workspace and profile, reads static PHP metadata, and never executes workspace PHP. On graphical Windows/macOS hosts omit xvfb-run; those platforms were not qualified in this batch.

Full F10/R4 acceptance remains open: other PHP/editor versions, installed VSIXs, complete tool combinations, real WSL UI and long sessions still need evidence. The convergence observations do not establish hot-query or visible-popup latency. The PHP Companion report `docs/php-language-toolchain/reports/php-twig-automatic-lifecycle-2026-10-07.{json,md}` contains exact commands, all observations, frozen input audits, original failures and SHA-256 archive manifests. No commit, push, package, installation or release was performed.
