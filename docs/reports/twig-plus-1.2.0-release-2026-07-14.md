# TwigPlus 1.2.0 release report — 2026-07-14

## Release identity

- Release commit: `a63668b1b416bfd05a6b003f129e870b1f2d7f93`.
- Annotated tag: `v1.2.0`; the peeled remote tag points to the release commit above.
- Pull request: [#15](https://github.com/sohophp/twig-plus/pull/15), squash-merged after every required check passed.
- Release CI: [run 29321752834](https://github.com/sohophp/twig-plus/actions/runs/29321752834), triggered by the exact release commit on `master` and completed successfully.
- GitHub Release: [TwigPlus 1.2.0](https://github.com/sohophp/twig-plus/releases/tag/v1.2.0).
- Marketplace package: [`sohophp.twig-plus`](https://marketplace.visualstudio.com/items?itemName=sohophp.twig-plus); VSCE accepted version `1.2.0` from the same CI-built VSIX.

## Automated verification

- Complete local suite: 341/341 tests — Language Spec 6, Parser 164, Formatter 62, VS Code adapter 54, Language Server 35, and bundled integration 20.
- Bundled integration includes the 9/9 stdio LSP scenarios; a managed-terminal stdin EOF is not treated as a regression signal.
- The release CI reproduced all 8 pinned Twig version snapshots and boundaries across PHP 8.1, 8.2, 8.4, and 8.5 where supported.
- The release CI reproduced all 3 pinned Symfony snapshots across the supported 6.4, 7.4, and 8.1 matrix combinations.
- `docs:check`, `dead-entries:check`, language asset checks, production `npm audit`, `reports:check`, and packaged VSIX content checks passed.
- Production dependency audit reported 0 vulnerabilities.

## Extension Host evidence

| Target | Result | Formatter cold / warm | Verified at (UTC) |
| --- | ---: | ---: | --- |
| VS Code 1.90.2 minimum | 25/25 | 13 / 4 ms | 2026-07-14 09:28:03 |
| VS Code 1.128.0 stable | 25/25 | 13 / 6 ms | 2026-07-14 09:28:24 |
| Independently installed VSIX on 1.128.0 | 25/25 | 8 / 6 ms | 2026-07-14 09:28:41 |

The three persisted reports belong to release CI run 29321752834. Electron DBus/GPU initialization messages under Xvfb were non-fatal; all Extension Host test runners exited with code 0.

## Published artifact

- File: `twig-plus-1.2.0.vsix`.
- Size: 9,402,772 bytes (about 8.97 MiB).
- SHA-256: `44c0560b2c9bfb2b9b52c49bddea0dd2a2875c3cd5a9ce6fb9fdf20f02b8b032`.
- The VSIX manifest reports extension version `1.2.0` and VS Code engine `^1.90.0`.
- The archive contains the bundled Language Server at `extension/dist/server.js` and the bundled TypeScript runtime, including `extension/dist/node_modules/typescript/lib/lib.dom.d.ts`.
- The GitHub Release asset digest and the packaged Extension Host report both match the SHA-256 above.

## Scope decision

Version 1.2.0 closes the existing Hybrid-only runtime line. Hybrid remains the sole runtime, Twig completion remains LSP-owned, and VS Code retains native Backspace behavior. Range Formatting, cross-template rename collision checks, and deeper Symfony references are included and verified.

Embedded Definition/Rename, Semantic Tokens, and Symfony type inference remain P1–P3 roadmap work. No new public LSP capability or metadata schema was added during release preparation.
