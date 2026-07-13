# 稳定编辑模型

## 所有权规则

- `language-configuration.json`：delimiter、括号、引号配对，indent/on-enter。
- LSP completion：一次 completion edit/snippet，负责 Twig 语法片段和空格。
- Formatter：保存或显式格式化时统一 code style。
- VS Code 原生命令：Backspace、Delete、Undo、Redo。

禁止使用 `onDidChangeTextDocument` 观察用户输入后再替换 delimiter、移动光标、强制触发建议或修补删除结果。禁止覆盖 Backspace。HTML 辅助若保留，必须是显式 command 或 VS Code 原生 provider 返回的单次 edit。

## 预期行为

- 默认 quick suggestions 开启时，`{% blo` 通过 `%`/空格 LSP trigger 提供 `block`；关闭时不强制弹出，Ctrl+Space 提供相同列表。
- completion 可生成 `{% block name %}`，formatter 将紧凑 delimiter 规范为空格样式。
- 独立完整 opening tag 后的 Enter 由 `twigPlus.insertLineBreak` 单次原子编辑补齐缺失 closing tag；已有 closing、inline、script/style 或混合多光标完全委托原生 Enter。
- `twigPlus.editing.htmlTagClosing` 默认为 `onType`：高度限定的 `>` command 仅在 Hybrid 确认单光标、空选区、完整且未配对的 HTML opening tag 时，以一次 edit 写入 `>` 与 matching closing tag；所有不确定上下文立即委托 VS Code 原生 `type`。真实 Extension Host 验证表明 formatting provider 会强制产生第二个 Undo 事务，因此这里以 PHPStorm 风格的单次 Undo/Redo 为优先。`onEnter` 保留旧工作流，`off` 完全关闭。
- void、自闭合、已有 closing、verbatim、snippet、结构不完整、多光标或 UI 冲突场景立即调用原生 `type`，不异步追改文档。一次 Undo/Redo 对称处理触发字符与 closing tag。
- Twig 结构 Enter closing 可通过 `twigPlus.editing.autoCloseTwigTags` 独立关闭，默认开启。
- `<style>` 内 CSS 规则的 Enter closing 由同一 Enter 控制器单次生成缩进和 `}`；开关为 `twigPlus.editing.autoCloseCssBraces`，默认开启。它不注册全局 `{}` 字符对，以免干扰 Twig `{{ }}`。
- CSS Enter 在生成 `}` 前会扫描当前 `<style>` 剩余内容（忽略字符串和注释中的花括号）；已经存在与 opening brace 匹配的 `}` 时完全委托原生 Enter，不得重复闭合。
- 匹配 HTML opening/closing tag 的同步修改由 VS Code 原生 Linked Editing 持有，TwigPlus 仅通过 Hybrid HTML 结构提供两个精确 tag-name range。`twigPlus.editing.linkedHtmlTags` 与 Twig 语言默认的 `editor.linkedEditing` 均为开启；关闭任意一项即可停用。
- `<script>` 内普通 brace 输入和 Backspace 由 VS Code 持有；光标位于已有 brace pair 中时，Enter 控制器可原子生成缩进并保留外层调用已有的 `)`。开关为 `twigPlus.editing.autoCloseJavaScriptBraces`，默认开启。
- 用户可以逐字符删除 delimiter 内容；一次 Undo 恢复一次用户操作，Redo 对称。
- JavaScript/CSS/attribute/string/IME 输入不会被 Twig delimiter 修正器二次编辑。

## 交互矩阵

每项必须验证最终文本、selection、Undo、Redo、等待 500ms 后文本不再变化：普通文本、Twig tag/output/comment、HTML attribute、JavaScript 字符串、CSS、IME、快速连续输入、多光标。

首版 Enter closing 不复制 `-`/`~` whitespace-control marker，统一生成普通 `{% end* %}`。
