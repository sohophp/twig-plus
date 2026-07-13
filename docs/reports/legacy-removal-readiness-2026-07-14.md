# Legacy parser removal readiness — 2026-07-14

## Reproducible upstream boundaries

- Twig runtime locks and committed snapshots: `3.0`, `3.8`, `3.12`, `3.15`, `3.21`, `3.23`, `3.26`, `3.28`.
- Symfony Twig Bridge/component locks and committed snapshots: `6.4.42`, `7.4.14`, `8.1.1`.
- The Symfony snapshots reproduce byte-for-byte on every supported local runtime: 6.4 on PHP 8.1/8.2/8.4/8.5, 7.4 on PHP 8.2/8.4/8.5, and 8.1 on PHP 8.4/8.5.
- CI rejects snapshot drift, duplicate or missing package facts, unexplained Language Spec/runtime differences, and the tracked Twig/Symfony capability boundaries.

Symfony split components are locked independently. The 8.1 oracle fixes `symfony/twig-bridge` at `8.1.1`; its lock records the actual compatible patch release of every other component.

## Pure Hybrid and regression gates

- Language Spec: 6/6 tests.
- Parser: 185/185 tests.
- Formatter: 62/62 tests, including incomplete/broken/CRLF/whitespace-control/embedded inputs, placeholder collisions, version-boundary samples, and three-pass idempotence.
- VS Code adapter: 53/53 tests.
- Language Server: 34/34 tests.
- Bundled integration: 20/20 tests, including stdio handshake, `defined` narrowing, Symfony 7.4 package/version selection, Hover, definitions, diagnostics, and source maps.
- Hybrid fatal fallback count observed by the readiness corpus: 0. Recoverable incomplete-document validation remains on Hybrid and is recorded separately from a fatal fallback.

## Symfony reference coverage

- Route, asset, translation, form theme, security role/attribute, controller fragment, and importmap references have package-aware completion, Hover, safe diagnostics, and definition support when a source location exists.
- Static indexing is bounded and reads only conventional YAML, XML/XLIFF, JSON, public assets, and a literal-only `importmap.php`; it never loads a workspace autoloader or executes PHP/Console code.
- Installed `symfony/twig-bridge` version selects callable facts: 7.4 adds `access_decision`; 8.1 adds Form Flow functions. Unknown/incomplete catalogs retain safe diagnostics.

## Real Extension Host and artifact

| Target | Result | Formatter cold / warm |
| --- | ---: | ---: |
| VS Code 1.90.2 | 25/25 | 24 / 12 ms |
| VS Code 1.128.0 | 25/25 | 19 / 10 ms |
| Independently installed VSIX on 1.128.0 | 25/25 | 27 / 10 ms |

- Artifact: `artifacts/vsix/twig-plus-1.1.2.vsix` (8.98 MB).
- SHA-256: `7064f315cb50548691d42c10ae0a2986de093b6b1e2a580d7f20851c304f8e9a`.
- Xvfb DBus/GPU warnings were non-fatal; every Extension Host exited with code 0.

## Decision

The local readiness implementation meets the zero-fallback and real Extension Host gates. Legacy removal must still wait for this readiness PR to pass GitHub Actions and merge. Only then should `refactor/remove-legacy-parser` be created from the merged readiness commit; the deletion remains isolated and reversible as required.
