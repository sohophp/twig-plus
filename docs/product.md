# 产品定位与功能状态

TwigPlus 服务使用 VS Code 编辑 Twig 3.x/Symfony 模板的开发者。目标是混合语言可靠、错误可定位、撤销符合编辑器习惯、发布产物可真实验证。

## 功能状态表

最后基线：VS Code 1.90.2 与 1.128.0，2026-07-12。`已验证` 表示最低版、当前稳定版及打包 VSIX 均有真实断言。

| 用户行为 | 所有者/实现 | 测试层级 | 状态与限制 |
| --- | --- | --- | --- |
| Twig tag/filter/function/test 补全 | LSP CompletionRegistry | unit/LSP/UI | 整改中：从 VS Code 本地 provider 迁移 |
| HTML tag/attribute/value 补全 | VS Code HTML language service | unit/UI | 已验证；只用于 Twig 文档 HTML 上下文 |
| `<script>` 高亮 | TextMate embedded `source.js` | grammar/UI | 已验证；颜色由主题决定 |
| `<script>` JavaScript 补全 | LSP + TypeScript LS + virtual document | unit/LSP/UI | 已验证；跳过 JSON/importmap/custom MIME |
| Twig/HTML/JS/CSS 格式化 | Formatter + LSP | unit/LSP/UI | 已验证；错误时原子失败；性能整改中 |
| Embedded JS diagnostics | TypeScript LS + source map | unit/LSP/UI | 已验证；不提供 hover/signature |
| template/block/macro 导航 | LSP workspace model | unit/LSP/UI | 已验证；动态模板路径无法解析 |
| 括号、引号、delimiter 配对 | VS Code language configuration | UI | 稳定模式；不保证即时插入 delimiter 空格 |
| opening tag Enter closing | VS Code 原子 Enter controller + Hybrid parser | unit/UI | 已验证；已有 closing 不重复，whitespace-control marker 暂不复制 |
| 删除/撤销/redo | VS Code 原生命令 | UI matrix | 整改中：移除自定义 Backspace |
| Symfony metadata | 可选 metadata provider | unit | 基础能力；缺失时静默降级 |

## 非目标与延期

- PHPStorm 逐像素配色或专有 formatter 复制。
- 输入 `{%` 后立即异步改写成 `{%  %}`；原因见 ADR-0001。
- TypeScript script、Vue/Stimulus 特殊语法、跨 script 作用域合并。
- hover、signature help、PHP/Symfony 类型推导。
