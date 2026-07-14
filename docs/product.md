# 产品定位与功能状态

TwigPlus 服务使用 VS Code 编辑 Twig 3.x/Symfony 模板的开发者。目标是混合语言可靠、错误可定位、撤销符合编辑器习惯、发布产物可真实验证。

## 功能状态表

最后基线：VS Code 1.90.2 与 1.128.0，2026-07-14。`已验证` 表示最低版、当前稳定版及打包 VSIX 均有真实断言。

| 用户行为 | 所有者/实现 | 测试层级 | 状态与限制 |
| --- | --- | --- | --- |
| Twig tag/filter/function/test 补全 | LSP CompletionRegistry | unit/LSP/UI | 已验证；VS Code adapter 不复制 Twig semantic completion |
| HTML tag/attribute/value 补全 | VS Code HTML language service | unit/UI | 已验证；只用于 Twig 文档 HTML 上下文 |
| `<script>` 高亮 | TextMate embedded `source.js` | grammar/UI | 已验证；颜色由主题决定 |
| `<script>` JavaScript 补全 | LSP + TypeScript LS + virtual document | unit/LSP/UI | 已验证；跳过 JSON/importmap/custom MIME |
| Twig/HTML/JS/CSS 格式化 | Formatter + LSP | unit/LSP/UI | 已验证；错误时原子失败；记录阶段耗时并执行性能预算 |
| Embedded JS diagnostics | TypeScript LS + source map | unit/LSP/UI | 已验证；诊断、Hover 与 Signature Help 映射回 Twig |
| Embedded JS Definition | TypeScript LS + source map | unit/LSP/UI | 当前 script 内局部声明与 import alias 已验证；外部库、生成占位和跨 script 目标安全跳过 |
| Embedded JS Rename | TypeScript LS + source map | unit/LSP/UI | prepare、标识符校验、同作用域冲突检查及完整 WorkspaceEdit 已验证；只修改当前可映射 script |
| Embedded JS Semantic Tokens | TypeScript LS 2020 classifications + source map | unit/LSP/UI | full/range 已验证；只发布完整映射的单行标识符，跳过 Twig 占位与 unsupported MIME |
| template/block/macro 导航 | LSP workspace model | unit/LSP/UI | 已验证；动态模板路径无法解析 |
| 括号、引号、delimiter 配对 | VS Code language configuration | UI | 稳定模式；不保证即时插入 delimiter 空格 |
| opening tag Enter closing | VS Code 原子 Enter controller + Hybrid parser | unit/UI | 已验证；已有 closing 不重复，whitespace-control marker 暂不复制 |
| HTML `>` closing | 安全限定 command + Hybrid HTML node | unit/UI | 默认开启；不确定场景立即委托原生 `type`，不使用异步文档监听 |
| Twig language facts | `@twig-plus/language-spec` | generation/unit/LSP | Core、legacy、Extra、Symfony、project 分层，生成 Grammar/snippets/indentation |
| 删除/撤销/redo | VS Code 原生命令 | UI matrix | 已验证；自定义 Backspace 已移除 |
| Symfony metadata | metadata v3 + bounded static index | unit/LSP | route、asset、translation、form、security、fragment、importmap；缺失时静默降级 |
| Hover / Signature Help | LSP + TypeScript virtual document | unit/LSP/UI | Twig catalog、局部/导入 macro 与 embedded JavaScript |
| Range Formatting | Hybrid parser + Formatter | unit/LSP/UI | 扩展到最小安全结构；不安全选区保持原文 |

## 非目标与延期

- PHPStorm 逐像素配色或专有 formatter 复制。
- 输入 `{%` 后立即异步改写成 `{%  %}`；原因见 ADR-0001。
- TypeScript script、Vue/Stimulus 特殊语法、跨 script 作用域合并。
- PHP/Symfony 控制器变量类型推导。
