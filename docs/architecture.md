# TwigPlus 架构与能力所有权

## 不变量

1. Parser 不依赖编辑器；Formatter 只依赖 Parser；LSP 依赖 Parser/Formatter；VS Code adapter 不拥有 Twig 语义。
2. 同一能力只有一个正常路径所有者。fallback 仅在 LSP 启动失败后注册。
3. 输入辅助不得监听一次 change 后再发起修正 change；编辑器原生配对和显式 completion edit 是允许的单事务入口。
4. Formatter 只提交完整成功结果，任何阶段失败都不得写回部分结果。

## 数据流

```text
.html.twig
    -> Hybrid parser / semantic model
    -> LSP completion, diagnostics, navigation
    -> formatter orchestration
       -> Twig printer
       -> HTML formatter
       -> embedded JavaScript/CSS virtual documents
       -> source-map writeback
    -> one LSP TextEdit or structured failure
```

## 所有权

| 能力 | 正常所有者 | VS Code adapter 职责 | fallback |
| --- | --- | --- | --- |
| Twig completion | Language Server | 展示 LSP item | LSP 失败时无 Twig semantic completion |
| Embedded JavaScript | Language Server/TypeScript LS | embedded grammar 注册 | 无静态伪候选 |
| HTML schema completion | VS Code adapter | HTML language service | 保持可用 |
| Diagnostics/navigation/rename | Language Server | Problems/UI 映射 | 明确注册本地兼容 provider |
| Formatting | Language Server/Formatter | 状态栏、Output Channel | 同一 Formatter API |
| 配对/撤销 | VS Code language configuration | 无文本追改 | VS Code 原生行为 |

## Parser 模式

- `hybrid` 是默认模式；无损 CST/AST 查询失败时只允许显式记录后降级。
- `hybrid-shadow` 用于比较，不得改变用户编辑结果。
- `legacy` 是兼容模式。模式、降级原因和差异写入 TwigPlus Output Channel，禁止静默差异。

## 生命周期

激活顺序为 UI/status -> HTML adapter -> Language Client。工作区索引后台执行，completion/navigation 可按需等待索引；formatting 永不等待模板索引。关闭文档时释放版本缓存，取消同文档的旧格式化请求。
