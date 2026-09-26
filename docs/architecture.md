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
| PHP Controller 上下文 | PHP Companion/metadata 提供事实，Twig LS 解释 | 版本化命令与通知桥 | 保留磁盘 metadata |

## Parser

- Hybrid lossless CST/AST 是唯一运行路径；diagnostics、navigation、selection 和 formatting 直接消费同一文档模型。
- Hybrid parse/validation/query 失败时返回结构化失败并记录 URI、query 与原因，不运行第二套查询，也不提交 TextEdit。
- tokenizer 仍是 Hybrid lexer 的组成部分；Symfony bundle-style 模板路径仍属于模板解析语法。
- 已移除的 parser engine 设置会被 VS Code 安全忽略，扩展不会自动改写用户 settings；用户可手动删除该旧键。

## 生命周期

激活顺序为 UI/status -> HTML adapter -> Language Client。工作区索引后台执行，completion/navigation 可按需等待索引；formatting 永不等待模板索引。关闭文档时释放版本缓存，取消同文档的旧格式化请求。

PHP Companion interop v1 只输入可序列化的模板名、变量类型、公共成员和 UTF-16 来源位置。Twig LS 校验协议版本与 workspace 身份，按 root/template 合并实时与磁盘上下文；不同 workspace 的同路径模板不会串线。共有成员的 Definition 保留并返回所有 Union 分支声明，变量本身仍导航到 Controller render 来源。完整 context 还可携带每个变量的精确 PHP 键范围；Twig LS 只为直接目标模板中的未解析外部变量生成跨语言 Rename，并把 Twig 引用与全部键合并为一个 WorkspaceEdit。VS Code adapter 合并连续 PHP 文档事件、串行获取快照，并按 workspace 的 snapshotVersion 与载荷内容共同跳过重复通知；未保存的 PHP 编辑可能沿用同一版本号。启动及 PHP 文件变化后最多重试 30 次，间隔 2 秒。Twig LS 按 workspace 和模板路径索引 context，快照更新时只重算受影响的已打开模板诊断。Twig parser、作用域、Union 共有成员、属性访问、诊断和格式化始终由 TwigPlus 决定。

Symfony 路由 Rename 采用反向请求：PHP Companion 证明路由声明和 PHP 调用后，请求 TwigPlus 返回项目中所有精确 `path()`/`url()` 字面量范围。TwigPlus 对工作区身份、名称、文件数、文件大小、读取结果和取消状态逐项验证；只有完整扫描才返回 `complete: true`。PHP Companion 再复核 URI、范围和原文本后合并单一 WorkspaceEdit，因此任一语言侧不完整都不会产生部分重命名。
