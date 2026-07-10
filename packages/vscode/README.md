# TwigPlus VSCode Extension

TwigPlus is the VSCode extension package inside the TwigPlus monorepo.

Current capabilities:

- Twig + HTML mixed formatting
- Embedded CSS and JavaScript formatting
- Twig snippets and completions
- Template path completions, including Symfony `templates/...` references and legacy bundle-style references such as `BlogBundle:post:show.html.twig`
- `Go to Definition` for template references and block names
- Twig block outline support
- Lightweight diagnostics for structural errors and missing templates

Release scope for `1.0.0`:

- Stable formatter-first Twig editing workflow for `.twig` and `.html.twig`
- PHPStorm-leaning whitespace, indentation, and block completion defaults
- Reusable parser/formatter core already split out for future CLI and LSP work

Current PHPStorm-alignment defaults:

- Twig indentation defaults to 4 spaces
- Completing opening tags such as `block` or `if` does not auto-insert the matching closing tag by default
- Closing-tag suggestions use real Twig tags such as `endblock` and `endif`, and only appear when the current document still has a matching unclosed block
- You can opt into paired insertion with `twigPlus.completion.autoInsertClosingTag`
- Twig control tags like `{% block content %} <div>` are split onto separate lines by default with `twigPlus.format.lineBreakAfterTwigControlTag`
- `Expand Selection` now understands Twig tags, paired Twig blocks, and surrounding HTML wrapper nodes more accurately

Reusable logic lives in:

- `@twig-plus/formatter`
- `@twig-plus/parser`

## Dev Host Notes

- Test inside the `Extension Development Host` window, not the original VSCode window.
- Make sure the file language mode is `Twig`.
- Formatting uses TwigPlus by default for `[twig]`, but if another formatter still appears, run `Format Document With...` once and pick `TwigPlus`.
- If formatter or typing hooks seem stale after a code change, run `Developer: Reload Window` inside the `Extension Development Host`.
- The `{%` typing hook is currently implemented as an editor change listener. If VSCode changes the exact auto-closing event shape, behavior may differ between builds even when formatter and completion still work.

## Release Checklist

1. Run `npm run build` from the workspace root.
2. Run `npm test` from the workspace root.
3. Run `npm run prepare-release --workspace packages/vscode` to vendor workspace runtime dependencies into the extension package.
4. Launch `F5` and verify formatting, completion, and template navigation inside the `Extension Development Host`.

## Packaging And Publish

- Create a VSIX locally with `npm run package:vsix --workspace packages/vscode`
- Publish to the VSCode Marketplace with `npm run publish:marketplace --workspace packages/vscode`
- The publish command uses `npx @vscode/vsce`, so the first run may download the packaging tool if it is not already available locally
- Before publishing, make sure you are logged in with `npx @vscode/vsce login sohophp`
- The packaged extension includes vendored `@twig-plus/parser` and `@twig-plus/formatter` runtime output via `prepare-release`

## Known limitations

- The `{%` input hook is still event-shape sensitive in VSCode, so auto-expanding to `{%  %}` may vary across editor builds.
- TwigPlus is already strong on formatter stability, but formatter parity with PHPStorm is still being tightened through real-page fixtures.
