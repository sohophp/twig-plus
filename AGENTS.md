# Repository Guidelines

## Project Structure & Module Organization

TwigPlus is an npm-workspaces monorepo. Packages under `packages/` are:

- `language-spec`: versioned Twig facts and upstream snapshots.
- `parser`: Hybrid CST/AST, semantic queries, diagnostics, and indexing.
- `formatter`: transactional Twig/HTML/CSS/JavaScript formatting.
- `language-server`: LSP providers and embedded TypeScript support.
- `vscode`: extension adapter, editing controllers, grammar, snippets, and Extension Host tests.

Unit tests sit in each package’s `test/`; cross-package tests are in `tests/integration/`. Use `examples/showcase` for valid demonstrations and `examples/basic-symfony` for UI scenarios. Documentation belongs in `docs/`; trusted PHP oracle tooling is under `tools/upstream-oracle`.

## Build, Test, and Development Commands

- `npm ci`: install the locked workspace dependencies.
- `npm run build`: build all packages and verify generated language assets.
- `npm test`: run the complete unit and integration suite.
- `npm run test --workspace packages/parser`: run one package’s Vitest suite.
- `npm run docs:check`: validate required docs and local links.
- `npm run dead-entries:check`: reject legacy parser paths and duplicate language facts.
- `npm run vscode:test:min --workspace packages/vscode`: run VS Code 1.90.2 Extension Host tests; use `vscode:test:current` for stable.
- `npm run package:vsix --workspace packages/vscode`: build the release VSIX.

## Coding Style & Naming Conventions

Follow `.editorconfig`: UTF-8, LF, final newline, and two-space indentation for TypeScript, JavaScript, JSON, Markdown, and YAML. Twig fixtures use four spaces unless a test selects another width. Prefer TypeScript types, small pure functions, native VS Code APIs, and Hybrid parser facts over regex-only guesses. Use `camelCase` for values/functions and `PascalCase` for types.

## Testing Guidelines

Vitest files use `*.test.ts`. Cover success, uncertain/incomplete input, and regressions. Editing changes must verify final text, selection, Undo/Redo, multi-cursor/IME safety, and a real Extension Host path. Formatter changes require exact output and three-pass idempotence. Regenerate assets with `npm run language-assets:generate`, then commit them.

## Commit & Pull Request Guidelines

Use concise imperative subjects, optionally with conventional prefixes: `fix:`, `feat:`, `test:`, or `refactor:`. Keep commits independently reversible. PRs should explain the root cause, user-visible behavior, compatibility risks, and commands run. Include screenshots only for visual/editor UI changes; include Extension Host reports and performance numbers for editing, LSP, or formatter changes. Open large changes as draft PRs and require clean CI before marking Ready.

## Security & Configuration

Never execute workspace PHP or load project autoloaders. Read only bounded, validated metadata and Composer/config files. Keep runtime behavior offline and avoid telemetry or automatic user-setting rewrites.
