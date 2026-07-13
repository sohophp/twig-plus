# Twig 3.28 conformance report — 2026-07-14

## Pinned upstream

- Twig `v3.28.0`, commit `762a989bf2f1a54939fa7da33065beba4ee46e3d`
- Symfony `v8.1.1`, commit `12cba50951f46635e6a692c66aa5d8ed7a189302`
- Runtime oracle: 21 token parsers, 102 registered callable records, 47 expression parsers
- Active TwigPlus catalog: 62 filters, 26 functions, 13 tests. The upstream wildcard `format_*_number` record is audited but not exposed as a literal completion.

## Coverage and regressions

- Official documented tags represented by positive PHP/Hybrid corpus cases: 22/22
- Registered operators with complete AST tests: 42/42
- Shared upstream conformance corpus: 34/34 expected accept/reject results
- Parser tests: 184 passed
- Formatter tests: 60 passed; the showcase and all golden fixtures are three-pass idempotent
- VS Code adapter tests: 53 passed
- Language server tests: 22 passed
- Bundled integration tests: 20 passed
- Machine-readable input replay scenarios: 5/5 mapped to a passing UI or bundled LSP test
- Observed Hybrid fatal fallback count: 0 across the unit, bundled LSP, minimum, stable, and packaged runs

## Performance samples

Rocky Linux 8 / Node 22.14.0 samples from the release workspace:

| Measurement | Result | Budget |
| --- | ---: | ---: |
| Typical diagnostic model median | 5.60 ms | < 100 ms |
| Large Hybrid parse median | 67.84 ms | < 100 ms |
| 10,000-path template completion median | 24.38 ms | does not block ordinary Twig catalog completion |
| VS Code 1.90.2 formatter cold / warm | 19 / 8 ms | < 500 ms |
| VS Code 1.128.0 formatter cold / warm | 31 / 11 ms | < 500 ms |
| Packaged VSIX formatter cold / warm | 41 / 9 ms | < 500 ms |

## Extension Host and artifact

- VS Code 1.90.2: 25/25 UI tests
- VS Code 1.128.0 stable: 25/25 UI tests
- Independently installed VSIX on VS Code 1.128.0: 25/25 UI tests
- Artifact: `artifacts/vsix/twig-plus-1.1.2.vsix` (8.96 MB)
- SHA-256: `5e3abcb47ff8a47248c404b6377eee0a2473bd8340dd66c903a2d6d27ce595bc`

DBus and GPU initialization messages emitted by Electron under Xvfb were non-fatal; all test processes exited with code 0.

## Legacy removal decision

The recorded fallback count is zero, but this report does not authorize deleting legacy yet. The schema and conformance infrastructure are in place, while exhaustive version-boundary fixtures for every callable and the optional deeper Symfony form/security/fragment/importmap indexes remain follow-up work. Legacy stays internal-only until those remaining deletion gates are represented in CI and pass repeatedly.
