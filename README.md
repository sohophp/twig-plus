# TwigPlus

TwigPlus 是面向 VS Code 和 LSP 客户端的 Twig 3.x 编辑工具链，目标是在不接管 PHP、HTML、CSS 或 JavaScript 文件的前提下，为 `.twig` 与 `.html.twig` 提供可靠的混合语言编辑体验。

当前稳定能力包括 Twig/HTML/CSS/JavaScript 分层格式化、Twig 与 HTML 补全、内嵌 JavaScript 高亮和 TypeScript 补全、诊断、模板与 block/macro 导航。项目追求可验证的 PHPStorm 等价工作流，不复制 JetBrains 的专有实现。

Hybrid CST/AST 是唯一用户运行模式；普通输入、brace、Backspace 与 Undo/Redo 优先使用 VS Code 原生事务。HTML `>` 只在 Hybrid 能证明单光标 opening tag 安全时形成一次原子 closing edit；JavaScript-only Twig block 的 `{}` 也只在单光标、无选区且词法上下文安全时形成一次原子编辑，其余场景立即委托原生输入。

## 工作区

| 包 | 职责 |
| --- | --- |
| `@twig-plus/parser` | 无损 Hybrid CST、Twig AST、语义模型、模板索引和 source map |
| `@twig-plus/formatter` | 事务式 Twig/HTML/JavaScript/CSS 格式化 |
| `@twig-plus/language-server` | completion、diagnostics、navigation、rename 和 formatting 的 LSP 所有者 |
| `twig-plus` | VS Code UI、grammar、language configuration、HTML schema 补全和 LSP 启动器 |

依赖方向固定为 `parser <- formatter <- language-server`，VS Code adapter 只消费这些能力，不复制语义实现。

## 开发与验证

```bash
npm install
npm run build
npm test
npm run vscode:test:current --workspace packages/vscode
npm run package:vsix --workspace packages/vscode
npm run vscode:test:packaged --workspace packages/vscode
```

VSIX 统一输出到 `artifacts/vsix/`。F5 调试前必须先构建，Extension Development Host 使用 `packages/vscode/dist`。

## 编辑原则

- delimiter、引号和括号的成对闭合由 VS Code 原生 language configuration 负责。
- completion snippet 和 formatter 负责 `{%  %}`、`{{  }}`、`{#  #}` 的空格风格。
- TwigPlus 不通过异步文档变更追改用户刚输入或删除的文本。
- 格式化任一语言阶段失败时，整个文档保持不变。
- 用户关闭 quick suggestions 后使用 Ctrl+Space；扩展不会绕过用户设置强制弹窗。
- 在缺少对应 closing tag 的独立 Twig opening tag 后按 Enter，会通过一次原子编辑插入缩进空行和 `end*`；一次 Undo/Redo 对称恢复。
- 在 Twig HTML 区域输入完整 `<div>` 后，默认以单次编辑插入 `></div>` 并把光标留在中间；一次 Undo/Redo 对称撤销或恢复 `>` 与 closing tag。void、自闭合、已有配对、verbatim 和多光标场景立即委托原生输入。
- Twig 3.28 的 tag/function/filter/test/operator、版本、来源和结束关系由 schema v2 language spec 提供；已提交的规范同时由官方 Composer 运行时快照与官网 reference manifest 审计。Twig 2 legacy syntax 仅用于无损解析旧模板，不进入 Twig 3 补全。

## 文档

- [产品与功能状态](docs/product.md)
- [架构与所有权](docs/architecture.md)
- [编辑模型](docs/editing-model.md)
- [格式化管线](docs/formatting.md)
- [测试与验收](docs/testing.md)
- [排障](docs/troubleshooting.md)
- [路线图](docs/roadmap.md)
- [VS Code 发布](docs/release-vscode.md)
- [架构决策](docs/decisions/README.md)

公开扩展使用说明和英文简介见 [packages/vscode/README.md](packages/vscode/README.md)。

## 非目标

当前整改阶段不新增 hover、signature help、Symfony/PHP 类型推导或 PHPStorm 即时 delimiter 空格改写。稳定性、撤销正确性、性能可见性和真实 VSIX 验证优先。
