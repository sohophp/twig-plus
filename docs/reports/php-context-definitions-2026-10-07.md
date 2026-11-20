# PHP context definition provenance and template namespaces

Date: 2026-10-07. Local source based on `c3d1aa5`; this is source qualification, not a release. The pre-existing parser and Extension Host changes remain intact and were included in the normal build.

Controller variable definitions now select every precise PHP render-key range. Semantic reference roles prevent PHP navigation from strings, comments, HTML, map keys, filters, tests, unrelated functions and named arguments. Local Twig declarations and their members retain their own scope. Property access and qualified method calls still navigate to the PHP declaration.

Template contexts now use resolved template identity, configured roots, bundle aliases and workspace-local namespaces. Namespace overrides follow the same parser ordering as template references. Nested workspace roots cannot inherit a parent's contexts. Configuration changes, file deletion/recreation and payload withdrawal update affected models, including namespace directories outside the default roots. Full mapping construction occurs on structural changes rather than every text edit.

The original precision suite failed 15 of 18 tests after a normal baseline build; the namespace suite failed 5 of 11. The final related suite passed 46 tests. Standard `npm test` passed 426 tests across 40 files, including all workspace builds and integration tests. An independent actual PHP Core/Symfony Provider/Twig server probe passed its original 15 checks.

VS Code 1.140.0 on Linux x64 passed 25 checks with all three actual source extensions and an explicit PHP 8.5 target. This includes normal and namespaced completion, exact key/getter definitions, unsaved PHP source shifts, Undo/Redo, incorrect-token rejection and cross-language Rename with Undo/Redo. A first host pass had a misspelled target-setting key; it was retained separately and does not establish the explicit target qualification. Original failures and the intermediate build error are retained in the coordinating PHP Companion report.

To run the independent source Extension Host fixture after building all three extensions:

```sh
TWIG_PLUS_TEST_PHP_CORE_PATH=/path/to/php-companion \
TWIG_PLUS_TEST_PHP_SYMFONY_PATH=/path/to/php-companion/packages/php-companion-symfony \
TWIG_PLUS_TEST_VSCODE_EXECUTABLE=/path/to/vscode/code \
TWIG_PLUS_PHP_DEFINITION_REPORT=/tmp/unique-php-context-report.json \
xvfb-run -a node packages/vscode/test/extension/runPhpContextTest.js
```

Run from the TwigPlus repository. The fixture uses a temporary workspace and isolated profile; it does not execute project PHP, install VSIXs or update a user profile. On graphical Windows/macOS hosts, omit `xvfb-run -a`.

Remaining acceptance includes unsaved PHP member-type changes, automatic refresh over longer sessions, additional PHP/indexing-mode/platform combinations, installed VSIXs and real WSL UI usage. The complete interop/product acceptance remains open.

The subsequent [automatic lifecycle qualification](php-context-automatic-lifecycle-2026-10-07.md) covers unsaved member-type changes and both indexing modes at PHP targets 7.2/8.5. The broader acceptance boundaries above remain open.
