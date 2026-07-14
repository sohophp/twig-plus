# TwigPlus for VSCode

TwigPlus brings a PHPStorm-like Twig editing workflow to VSCode, focused on three core areas:

- mixed Twig / HTML / CSS / JavaScript formatting
- Twig tag, filter, function, and template path completion
- Standard HTML tag, attribute, and attribute-value completion across Twig attribute branches
- `Go to Definition` for `extends`, `include`, `embed`, `import`, `from`, blocks, and macros

The default behavior is intentionally conservative: TwigPlus should improve `.twig` and `.html.twig` editing without taking over unrelated PHP, JavaScript, CSS, or HTML files.

## Recommended Setup

TwigPlus contributes itself as the default formatter for the `twig` language. For the closest PHPStorm-like workflow, add this to your workspace or user settings:

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

You can also run this command from the Command Palette:

```text
TwigPlus: Apply Recommended Twig Settings
```

The command writes the recommended settings to the current workspace. TwigPlus does not silently change global settings during installation.

To inspect the active file and effective TwigPlus settings, run:

```text
TwigPlus: Show Status
```

## Features

- Formats Twig files that mix Twig tags, HTML markup, embedded `<script>`, and embedded `<style>`
- Preserves Twig placeholders while formatting embedded JavaScript and CSS
- Highlights JavaScript inside `<script>` while preserving Twig delimiter scopes
- Provides TypeScript-powered JavaScript completion in regular and `type="module"` scripts; JSON, import maps, and custom script types are excluded
- Provides source-mapped Definition, safe Rename, and full/range Semantic Tokens for local identifiers inside each supported script
- Inserts callable JavaScript completions with paired parentheses and keeps the cursor inside the call
- Completes Twig tags such as `if`, `block`, `for`, `else`, `elseif`, `extends`, `include`, `embed`, `import`, `from`, `macro`, `set`, `apply`, and `with`
- Completes common Twig filters and functions
- Completes template paths from Symfony-style roots:
  - `templates/`
  - `app/Resources/views/`
  - `src/*/Resources/views/`
- Resolves same-directory, `./`, `../`, and legacy bundle-style references such as `BlogBundle:post:show.html.twig`
- Navigates template references used by `extends`, `include`, `embed`, `import`, and `from`
- Navigates block and macro references when the target can be resolved precisely
- Finds references and safely renames local variables and macros, including imported macro calls across templates
- Shows Twig and embedded JavaScript hover information and signature help
- Formats a selected range by expanding it to the smallest complete safe Twig/HTML structure
- Uses a bundled Language Server Protocol implementation for editor-neutral semantic features
- Uses VS Code native delimiter, quote, parenthesis, deletion, undo, and redo behavior; `{}` is inserted atomically only in a safe JavaScript code position inside a real `<script>` element

Embedded JavaScript uses the active VS Code theme for syntax and TypeScript-classified identifier colors. Syntax errors are reported in the Twig document and cause formatting to preserve the original document. Twig and embedded JavaScript Hover and Signature Help are provided by the bundled language server; richer Symfony/PHP-derived variable types depend on optional project metadata.

TwigPlus can optionally merge project-provided Symfony metadata v3 from `.twig-plus/symfony-metadata.json`. In `auto` mode each reference feature requires Twig Bridge/Bundle and its owning component. Routes, assets, translations, form themes, security attributes, fragment controllers and importmap entrypoints receive package-aware completion; metadata entries with safe workspace-relative source locations also support Hover and navigation. Bounded conventional YAML/XML/XLIFF/JSON, literal-only `importmap.php`, and `public/` assets are indexed statically. Missing or incomplete metadata never blocks generic Twig features, and TwigPlus never loads an autoloader or executes workspace PHP.

Completion and formatting follow the PHPStorm-style spaced delimiter baseline, including `{{  }}`, `{%  %}`, and `{#  #}`. Raw typing uses VS Code's native pairs and may remain compact until completion or formatting. Completion includes context-aware tags, filters, functions, and tests such as `is defined`; malformed embedded code aborts formatting without partial edits.

## Configuration Reference

| Setting | Type | Default | Description |
| --- | --- | --- | --- |
| `twigPlus.format.enable` | boolean | `true` | Enables TwigPlus document formatting. |
| `twigPlus.format.profile` | `"phpstorm"` or `"compact"` | `"phpstorm"` | Selects the formatting profile. Use `phpstorm` for the default PHPStorm-like whitespace and line-breaking behavior. |
| `twigPlus.format.indentSize` | integer | `2` | Number of spaces used for indentation when tabs are disabled. |
| `twigPlus.format.printWidth` | integer | `100` | Preferred maximum line width for embedded CSS and JavaScript formatting. |
| `twigPlus.format.useTabs` | boolean | `false` | Uses tabs instead of spaces for indentation. |
| `twigPlus.format.twigTagSpacing` | boolean | `true` | Normalizes spacing inside Twig tags, for example `{%if user%}` to `{% if user %}`. |
| `twigPlus.format.htmlAttributeWrap` | `"preserve"`, `"auto"`, or `"force"` | `"auto"` | Controls whether long HTML opening tags are wrapped to one attribute per line. |
| `twigPlus.format.preserveSingleLineBlocks` | boolean | `true` | Keeps simple single-line HTML blocks such as `<span>{{ value }}</span>` on one line. |
| `twigPlus.format.lineBreakAfterTwigControlTag` | boolean | `true` | Breaks lines after Twig control tags like `block`, `if`, `else`, and `endblock` when markup or text follows on the same line. |
| `twigPlus.editing.htmlTagClosing` | `onType` / `onEnter` / `off` | `onType` | Atomically types `>` and a closing tag only for a provably safe single-cursor HTML opening; every uncertain case delegates to native typing. |
| `twigPlus.editing.autoCloseHtmlTags` | boolean | `true` | Deprecated compatibility switch; explicit `false` maps to `off`. |
| `twigPlus.editing.autoCloseTwigTags` | boolean | `true` | Atomically inserts the matching `end*` tag when Enter is pressed after a complete Twig control tag. |
| `twigPlus.editing.autoCloseCssBraces` | boolean | `true` | Atomically inserts an indented `}` when Enter is pressed after `{` inside a style element. |
| `twigPlus.editing.autoCloseJavaScriptBraces` | boolean | `true` | Atomically pairs safe JavaScript braces and expands an existing pair on Enter inside `<script>`. Strings, comments, regexes and uncertain contexts delegate to VS Code. |
| `twigPlus.editing.linkedHtmlTags` | boolean | `true` | Uses VS Code native linked editing to synchronize matching HTML opening and closing tag names. Twig documents enable `editor.linkedEditing` by default. |
| `twigPlus.diagnostics.unresolvedNameMode` | `safe` / `strict` / `off` | `safe` | Safe mode avoids reporting application variables unless authoritative template context metadata is available. |
| `twigPlus.diagnostics.unresolvedNames` | boolean | `false` | Deprecated compatibility switch; `true` maps to strict and `false` to off. |
| `twigPlus.twig.version` | string | detected | Overrides the Twig 3.x version otherwise read from safe metadata or `composer.lock`. |
| `twigPlus.symfony.reference` | `auto` / `on` / `off` | `auto` | Enables static Symfony route, asset, translation, form, security, fragment, and importmap references; `auto` requires Twig Bridge/Bundle plus the owning component. |
| `twigPlus.diagnostics.globals` | string[] | `[]` | Names supplied by Symfony or the host application and excluded from unresolved-name diagnostics. |

TwigPlus also contributes this language default:

```json
{
  "[twig]": {
    "editor.defaultFormatter": "sohophp.twig-plus"
  }
}
```

## Dependencies And Extension Interop

TwigPlus does not require Prettier, PHP CS Fixer, PHP Intelephense, or GitHub Copilot to work.

- Prettier is bundled into TwigPlus formatting internals. Installing the Prettier extension is optional.
- PHP CS Fixer affects PHP files, not TwigPlus formatting.
- PHP Intelephense affects PHP language features, not TwigPlus Twig providers.
- GitHub Copilot may add suggestions while typing, but it should not replace TwigPlus formatter, completion, or definition providers.
- Use `TwigPlus: Select Parser Engine` to switch parser modes without editing workspace JSON manually.

If another extension formats Twig files unexpectedly, set `editor.defaultFormatter` for `[twig]` to `sohophp.twig-plus`.

GitHub Copilot does not register a Twig formatter, definition provider, or Twig template path provider. It can affect inline suggestions while typing, but it should not prevent TwigPlus formatting or template navigation. If TwigPlus appears inactive, check these first:

1. The active file language mode must be `Twig`, not `HTML`.
2. `TwigPlus: Show Status` should report `Language mode: twig`.
3. `[twig].editor.defaultFormatter` should be `sohophp.twig-plus`.
4. Run `Developer: Reload Window` after installing or switching profiles.
5. If the command is missing, the installed extension package is stale; reinstall the latest VSIX or run from source with `F5`.

## Development And Verification

Use the Extension Development Host when testing local changes:

1. Press `F5` from this repository.
2. Open a `.twig` or `.html.twig` file in the Extension Development Host window.
3. Confirm the language mode is `Twig`.
4. Run `Format Document`, Twig completion, template path completion, and `Go to Definition`.

When running from source, the Extension Development Host uses `packages/vscode/dist/extension.js`. Run `npm run build --workspace packages/vscode` or use the provided `F5` launch task before testing a newly added command.

Release verification commands:

```bash
npm run build
npm run test
npm run vscode:test --workspace packages/vscode
npm run package:vsix --workspace packages/vscode
```

## Known Limitations

- TwigPlus aims to be close to PHPStorm for common Twig editing, not a byte-for-byte clone of every PHPStorm formatter decision.
- HTML schema-aware features such as required attributes and required subtags are intentionally deferred.
- Advanced PHPStorm-specific closed-source behavior is approximated from observable behavior and JetBrains IntelliJ Community platform behavior where available.
- Immediate rewriting of `{%` to `{%  %}` is intentionally deferred because a second asynchronous edit conflicts with rapid typing, IME, Backspace, and the undo stack.

## 中文说明

TwigPlus 是一个面向 VSCode 的 Twig 扩展，目标是尽量接近 PHPStorm 中常用的 Twig 编辑体验。当前重点是三件事：

- Twig / HTML / CSS / JavaScript 混合格式化
- Twig tag、filter、function、模板路径补全
- `extends`、`include`、`embed`、`import`、`from`、block、macro 的跳转定位
- 当前 `<script>` 内局部 JavaScript 标识符的 Definition、安全 Rename 与 Semantic Tokens

推荐配置：

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

也可以在命令面板执行：

```text
TwigPlus: Apply Recommended Twig Settings
```

这个命令会把推荐配置写入当前 workspace。扩展安装时不会静默修改你的全局 VSCode 设置。

如果怀疑扩展没有生效，先执行：

```text
TwigPlus: Show Status
```

重点看当前文件的 `Language mode` 是否为 `twig`，以及 `[twig]` 的 `editor.defaultFormatter` 是否为 `sohophp.twig-plus`。

TwigPlus 不依赖 Prettier、PHP CS Fixer、PHP Intelephense 或 GitHub Copilot。Prettier 作为运行时依赖已经随扩展打包；其它扩展最多会影响各自负责的语言或建议来源。Copilot 可能影响输入时的 inline suggestion，但不会注册 Twig formatter，也不会替代 TwigPlus 的模板路径跳转。如果 Twig 文件格式化结果混乱，请优先确认 `[twig]` 的 `editor.defaultFormatter` 是 `sohophp.twig-plus`，并确认文件语言模式不是 `HTML`。
