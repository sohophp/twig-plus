# 路线图

## 1.2.0 已完成基线

1. 文档、能力所有权和纯 Hybrid runtime 基线。
2. 已删除异步输入追改、自定义 Backspace、全局 brace/`>` 接管和重复 completion；只保留真实 `<script>` 与安全 HTML opening 的窄范围原子编辑。
3. Formatter 结构化结果、Range Formatting、进度、取消、预热和性能预算。
4. 完整交互矩阵与真实 VSIX 验收。

## 1.2.x 实用性推进

- Embedded JavaScript Definition、安全 Rename 与 Semantic Tokens 已覆盖当前 script 内可完整映射的局部标识符；Twig 占位、unsupported MIME、外部和跨 script 内容保持安全跳过。
- 扩展当前 route、translation、asset、form、security、fragment、importmap 索引，增加 controller variable 类型上下文。
- 已完成 LSP 结构化 Quick Fix：嵌套 closing 逆栈原子补齐，unexpected tag 与 empty output 精确删除；不为 unresolved name 或项目元数据诊断猜测修改。

## 明确延期

- 即时 `{%  %}` delimiter 空格模式。
- TypeScript/custom MIME/Vue/Stimulus script。
- 固定 PHPStorm 配色和专有行为复制。
