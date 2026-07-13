# 测试与验收

## 层级

- Parser/Formatter unit：容错、source map、错误语料、三次幂等。
- VS Code unit：grammar、language configuration、HTML context 纯逻辑。
- stdio LSP integration：initialize、completion、diagnostics、format progress/result、workspace index。
- Extension Host：真实 type/delete/undo/redo/completion/format 命令。
- Packaged VSIX：从 `artifacts/vsix/` 解包并重复 Extension Host 套件。

## 命令

```bash
npm test
npm run vscode:test:min --workspace packages/vscode
npm run vscode:test:current --workspace packages/vscode
npm run package:vsix --workspace packages/vscode
npm run vscode:test:packaged --workspace packages/vscode
npm run docs:check
```

退出码 0 不是单独的验收依据。UI runner 必须写报告并校验执行数量、每项断言、VS Code 版本和耗时。下载失败归类为 infrastructure，不得写成产品通过或失败。

日志和报告：`packages/vscode/.vscode-test-results/`。必须存在 `ui-1.90.2.json`、`ui-stable.json` 和 `ui-packaged.json`；packaged 报告还必须记录 VSIX 路径与 SHA-256。使用 `npm run reports:check` 校验。VSIX 位于 `artifacts/vsix/`。

当前 Extension Host 矩阵覆盖自动/手动 completion、HTML linked editing、HTML/Twig/CSS/JavaScript 原子 Enter、原生删除与 Undo/Redo、IME、Hover、Signature Help、Range Formatting 和错误格式化。Formatter/LSP 核心冷路径目标小于 2000ms；Extension Host 首次 provider 调度容差小于 2500ms；热路径小于 500ms。报告必须保留实际值，不能用容差隐藏阶段超时。
