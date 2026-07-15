# 排障

## Rocky Linux / WSL 无界面环境下 Extension Host 无法启动

直接运行 `npm run vscode:test:min --workspace packages/vscode` 出现 `Missing X server or $DISPLAY`，表示当前 shell 没有图形显示。在正常的 headless Linux 上使用：

```bash
xvfb-run -a npm run vscode:test:min --workspace packages/vscode
```

WSLg 已开启且 `DISPLAY=:0`、`/mnt/wslg/.X11-unix/X0` 存在时，可以直接运行测试，不需要再套 `xvfb-run`：

```bash
npm run vscode:test:min --workspace packages/vscode
```

出现 `Exit code: 0` 和 `[TwigPlus UI] VERIFIED` 即为有效结果。WSLg 的 `/tmp/.X11-unix` 通常是指向 `/mnt/wslg/.X11-unix` 的软链接；某些 Xvfb 版本无法在该布局中创建额外的 `X99` socket，所以“直接 WSLg 通过、`xvfb-run` 失败”并不矛盾，应采用已经通过的直接 WSLg 结果。

如果随后只出现 DBus/GPU 日志并一直等待，而且结束时出现 `/usr/bin/xvfb-run: ... kill: No such process`，先检查 X11 socket：

```bash
ls -ld /tmp/.X11-unix
readlink -e /tmp/.X11-unix
```

仅当 `/tmp/.X11-unix` 指向不存在的目标、且 WSLg 本身也不可用时，才修复系统临时目录：

```bash
sudo rm -f /tmp/.X11-unix
sudo install -d -m 1777 /tmp/.X11-unix
```

如果 WSLg 当前有效，不要执行上面的删除命令，否则会破坏 WSLg 的 `:0` socket 路径。

如果 shell 还保留了不存在的 `/run/user/<uid>` DBus/XDG 路径，使用临时干净会话运行：

```bash
env -u XDG_RUNTIME_DIR -u DBUS_SESSION_BUS_ADDRESS dbus-run-session -- xvfb-run -a npm run vscode:test:min --workspace packages/vscode
```

DBus 或 GPU 的单独 `ERROR` 日志不等于测试失败。验收依据是进程退出码为 0、出现 `[TwigPlus UI] VERIFIED`，并且 `packages/vscode/.vscode-test-results/ui-1.90.2.json` 记录全部测试通过。

## F5 没有变化

先运行 `npm run build --workspace packages/vscode`，再重新启动 Extension Development Host。确认文件语言模式为 Twig，执行 `TwigPlus: Show Status` 检查 formatter 和 Language Server 状态。

## 没有补全

确认 `editor.quickSuggestions` 未对 Twig 关闭；手动按 Ctrl+Space。Twig semantic completion 来自 Language Server，HTML completion 来自 VS Code adapter。查看 `Output -> TwigPlus` 和 `Output -> TwigPlus Language Server`，不要用其它语言候选是否出现判断 TwigPlus 正常。

## 格式化很慢或像卡住

状态栏显示阶段；Output Channel 显示各阶段耗时。若停在 JavaScript/CSS，先查看 Problems。错误文档不会被部分修改。提供日志时同时提供 URI、文件大小、冷/热运行和最慢阶段。

## 删除或撤销异常

稳定模型不覆盖 Backspace/Undo。先确认安装的是最新 `artifacts/vsix/`，Reload Window，并检查是否有其它扩展覆盖按键。若仍复现，记录初始文本、selection、按键序列、最终文本和一次 Undo 结果。
