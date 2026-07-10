# TwigPlus for VSCode

TwigPlus brings a PHPStorm-like Twig editing workflow to VSCode, focused on three core areas:

- mixed Twig / HTML / CSS / JavaScript formatting
- Twig tag, filter, function, and template path completion
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

## Features

- Formats Twig files that mix Twig tags, HTML markup, embedded `<script>`, and embedded `<style>`
- Preserves Twig placeholders while formatting embedded JavaScript and CSS
- Completes Twig tags such as `if`, `block`, `for`, `else`, `elseif`, `extends`, `include`, `embed`, `import`, `from`, `macro`, `set`, `apply`, and `with`
- Completes common Twig filters and functions
- Completes template paths from Symfony-style roots:
  - `templates/`
  - `app/Resources/views/`
  - `src/*/Resources/views/`
- Resolves same-directory, `./`, `../`, and legacy bundle-style references such as `BlogBundle:post:show.html.twig`
- Navigates template references used by `extends`, `include`, `embed`, `import`, and `from`
- Navigates block and macro references when the target can be resolved precisely
- Provides PHPStorm-like typing helpers for Twig delimiters, Twig expression pairs, HTML closing tags, and HTML attribute quotes

## Configuration Reference

| Setting | Type | Default | Description |
| --- | --- | --- | --- |
| `twigPlus.format.enable` | boolean | `true` | Enables TwigPlus document formatting. |
| `twigPlus.format.profile` | `"phpstorm"` or `"compact"` | `"phpstorm"` | Selects the formatting profile. Use `phpstorm` for the default PHPStorm-like whitespace and line-breaking behavior. |
| `twigPlus.format.indentSize` | integer | `4` | Number of spaces used for indentation when tabs are disabled. |
| `twigPlus.format.printWidth` | integer | `100` | Preferred maximum line width for embedded CSS and JavaScript formatting. |
| `twigPlus.format.useTabs` | boolean | `false` | Uses tabs instead of spaces for indentation. |
| `twigPlus.format.twigTagSpacing` | boolean | `true` | Normalizes spacing inside Twig tags, for example `{%if user%}` to `{% if user %}`. |
| `twigPlus.format.htmlAttributeWrap` | `"preserve"`, `"auto"`, or `"force"` | `"auto"` | Controls whether long HTML opening tags are wrapped to one attribute per line. |
| `twigPlus.format.preserveSingleLineBlocks` | boolean | `true` | Keeps simple single-line HTML blocks such as `<span>{{ value }}</span>` on one line. |
| `twigPlus.format.lineBreakAfterTwigControlTag` | boolean | `true` | Breaks lines after Twig control tags like `block`, `if`, `else`, and `endblock` when markup or text follows on the same line. |
| `twigPlus.completion.autoInsertClosingTag` | boolean | `false` | When completing opening Twig control tags, also inserts the matching closing tag snippet. Disabled by default to match PHPStorm-style completion. |

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

- Prettier is vendored for TwigPlus formatting internals. Installing the Prettier extension is optional.
- PHP CS Fixer affects PHP files, not TwigPlus formatting.
- PHP Intelephense affects PHP language features, not TwigPlus Twig providers.
- GitHub Copilot may add suggestions while typing, but it should not replace TwigPlus formatter, completion, or definition providers.

If another extension formats Twig files unexpectedly, set `editor.defaultFormatter` for `[twig]` to `sohophp.twig-plus`.

## Development And Verification

Use the Extension Development Host when testing local changes:

1. Press `F5` from this repository.
2. Open a `.twig` or `.html.twig` file in the Extension Development Host window.
3. Confirm the language mode is `Twig`.
4. Run `Format Document`, Twig completion, template path completion, and `Go to Definition`.

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

## 中文说明

TwigPlus 是一个面向 VSCode 的 Twig 扩展，目标是尽量接近 PHPStorm 中常用的 Twig 编辑体验。当前重点是三件事：

- Twig / HTML / CSS / JavaScript 混合格式化
- Twig tag、filter、function、模板路径补全
- `extends`、`include`、`embed`、`import`、`from`、block、macro 的跳转定位

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

TwigPlus 不依赖 Prettier、PHP CS Fixer、PHP Intelephense 或 GitHub Copilot。Prettier 作为运行时依赖已经随扩展打包；其它扩展最多会影响各自负责的语言或建议来源。如果 Twig 文件格式化结果混乱，请优先确认 `[twig]` 的 `editor.defaultFormatter` 是 `sohophp.twig-plus`。
