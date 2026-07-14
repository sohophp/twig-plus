# 路线图

## 当前整改

1. 文档和所有权基线。
2. 已删除异步输入追改、自定义 Backspace、全局 brace/`>` 接管和重复 completion；仅保留 Hybrid/词法上下文可证明安全的 HTML closing 与 JavaScript-only block brace 原子编辑。
3. Formatter 结构化结果、Range Formatting、进度、取消、预热和性能预算。
4. 完整交互矩阵与真实 VSIX 验收。

## 基线稳定后

- 更完整的 embedded definition、rename 与 semantic tokens。
- Symfony extension、route、translation、asset、controller variable 类型索引。
- range formatting、跨模板 rename 冲突检查和更完整 quick fixes。

## 明确延期

- 即时 `{%  %}` delimiter 空格模式。
- TypeScript/custom MIME/Vue/Stimulus script。
- 固定 PHPStorm 配色和专有行为复制。
