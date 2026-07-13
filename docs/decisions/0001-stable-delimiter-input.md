# ADR-0001：稳定 delimiter 输入优先

- 状态：Accepted
- 日期：2026-07-12

## 决策

默认不把用户输入 `{%` 通过异步 document change 改写为 `{%  %}`。成对闭合由 VS Code language configuration 负责，空格由 completion snippet 和 formatter 负责。

## 原因

异步追改会与 VS Code 原生 auto-close、快速连续输入、IME、completion trigger、Backspace 和 undo stack 竞争。同一按键可能形成两个编辑事务，导致重复 closing delimiter、光标漂移、删除后恢复和一次 Undo 无法还原。

## 后果

稳定性和撤销语义优先；即时外观可能与 PHPStorm 不同。未来只有在单次原子编辑、完整交互矩阵和默认关闭的实验配置下，才重新评估即时 spacing。
