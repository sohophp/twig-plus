# 排障

## F5 没有变化

先运行 `npm run build --workspace packages/vscode`，再重新启动 Extension Development Host。确认文件语言模式为 Twig，执行 `TwigPlus: Show Status` 检查 formatter 和 Language Server 状态。

## 没有补全

确认 `editor.quickSuggestions` 未对 Twig 关闭；手动按 Ctrl+Space。Twig semantic completion 来自 Language Server，HTML completion 来自 VS Code adapter。查看 `Output -> TwigPlus` 和 `Output -> TwigPlus Language Server`，不要用其它语言候选是否出现判断 TwigPlus 正常。

## 格式化很慢或像卡住

状态栏显示阶段；Output Channel 显示各阶段耗时。若停在 JavaScript/CSS，先查看 Problems。错误文档不会被部分修改。提供日志时同时提供 URI、文件大小、冷/热运行和最慢阶段。

## 删除或撤销异常

稳定模型不覆盖 Backspace/Undo。先确认安装的是最新 `artifacts/vsix/`，Reload Window，并检查是否有其它扩展覆盖按键。若仍复现，记录初始文本、selection、按键序列、最终文本和一次 Undo 结果。
