# 事务式格式化

## 管线

固定阶段为 `parse -> twig -> html -> javascript/css -> mapping -> complete`。每阶段产生耗时；Output Channel 保留请求、URI、阶段、结果和错误，状态栏只显示当前阶段，不发送外部遥测。

Formatter 只执行一次 Hybrid parse/validation/print 管线。任一阶段失败时返回结构化失败、保持原文并且不产生 TextEdit。Prettier 和 TypeScript 分别延迟到首次 embedded CSS/JavaScript 与支持的 script 分析。

Range Formatting 先把选区扩展到最小完整 Twig/HTML 结构，保持外层缩进与 EOL，并返回一个 edit。无法形成安全边界或包含未闭合 embedded block 时不修改文档。

Formatter 成功时返回完整文本和 timings；失败时返回稳定 error code、语言、原文 range、消息和 timings。失败结果不包含部分格式化文本。LSP 只在 success 时返回一个 whole-document edit。

## 错误与取消

- Twig、HTML、JavaScript、CSS 或 source map 任一阶段失败：原文不变，Problems 保留定位，format request 明确失败。
- 同一 URI 的新请求取消旧请求；关闭文档也取消请求。
- 工作区模板索引和 `workspace/configuration` 请求都不在 formatting critical path；使用 Language Client 已同步的设置快照。

## 性能预算

- Formatter/LSP 核心的典型示例冷启动低于 2 秒；Extension Host 首次 provider 往返单独采用 2.5 秒环境容差。
- 预热后低于 500ms。
- 超预算不伪装成功，Output Channel 必须列出最慢阶段。
- Prettier/TypeScript 运行时在空闲时预热，不扫描或修改用户文件。
