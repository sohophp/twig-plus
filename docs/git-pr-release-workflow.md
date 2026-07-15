# Git、Pull Request 与版本发布流程

本文说明 TwigPlus 完成代码修改后，如何进行本地验证、提交 Git、推送 Pull Request（PR），以及发布新的 VS Code 扩展版本。所有命令默认从仓库根目录执行。

## 1. 基本原则

- 一个分支只处理一个明确主题，推荐使用 `fix/`、`feat/`、`test/`、`refactor/` 或 `release/` 前缀。
- 提交前先检查实际差异，只暂存属于当前任务的文件，不要顺手提交无关改动。
- 普通 PR 根据影响范围运行针对性测试；准备发布时必须运行完整发布门禁。
- Formatter 修改必须验证精确输出和连续三次格式化幂等。
- 编辑行为修改必须验证最终文本、选区、Undo/Redo、多光标或 IME 安全性，以及真实 Extension Host 路径。
- 不执行项目工作区内的 PHP，也不加载项目 autoloader。Oracle 命令只运行仓库中受信任的 `tools/upstream-oracle` 工具。
- Marketplace、Git tag 和 GitHub Release 必须来自已经合并且 CI 成功的同一个发布提交。

## 2. 环境准备

推荐使用 Node.js 22，并从锁文件安装依赖：

```bash
node --version
npm --version
npm ci
```

确认 GitHub CLI 和远程仓库：

```bash
gh auth status
git remote -v
git status --short --branch
```

Marketplace 发布者需要额外完成一次登录：

```bash
npx @vscode/vsce login sohophp
```

不要把 PAT、登录输出、`.env` 或其他凭据提交到仓库。

## 3. 创建开发分支

从最新的 `master` 创建分支：

```bash
git switch master
git pull --ff-only origin master
git switch -c fix/short-description
```

功能开发可使用 `feat/short-description`，版本发布准备可使用 `release/vX.Y.Z`。

如果当前工作区已有未提交修改，先用以下命令确认它们的归属，不要使用 `git reset --hard` 或覆盖他人修改：

```bash
git status --short
git diff
```

## 4. 修改完成后的本地检查

### 4.1 基础检查

每次提交前至少运行：

```bash
git status --short
git diff --check
git diff --stat
git diff
```

`git diff --check` 必须无输出，表示没有尾随空格或冲突标记等问题。

### 4.2 按修改范围运行测试

| 修改范围 | 建议命令 |
| --- | --- |
| Parser | `npm run test --workspace packages/parser` |
| Formatter | `npm run test --workspace packages/formatter` |
| VS Code 扩展 | `npm run test --workspace packages/vscode` |
| Language Server | `npm run test --workspace packages/language-server` |
| Language Spec | `npm run test --workspace packages/language-spec` |
| 跨包行为 | `npm test` |
| 文档 | `npm run docs:check` |
| 清理旧入口或语言事实 | `npm run dead-entries:check` |
| 生成语言资产 | `npm run language-assets:generate`，然后提交生成文件 |

构建全部 workspace：

```bash
npm run build
```

完整单元测试和集成测试：

```bash
npm test
```

`npm test` 已包含完整构建，但在开发中可先运行单个 workspace 测试以缩短反馈时间。

### 4.3 Extension Host 验证

最低支持版本和当前稳定版：

```bash
npm run vscode:test:min --workspace packages/vscode
npm run vscode:test:current --workspace packages/vscode
```

Linux 无图形桌面时使用：

```bash
xvfb-run -a npm run vscode:test:min --workspace packages/vscode
xvfb-run -a npm run vscode:test:current --workspace packages/vscode
```

WSLg 已开启且 `DISPLAY=:0` 可用时，直接运行前一组 npm 命令即可；不要求再用 `xvfb-run` 重复验证。

如果 `xvfb-run` 结束时报告 `kill: No such process` 或一直没有出现 `[TwigPlus UI] START`，说明虚拟显示器本身没有成功启动；按 [Rocky Linux / WSL 无界面环境排查](troubleshooting.md#rocky-linux--wsl-无界面环境下-extension-host-无法启动) 检查 X11 socket 和 DBus/XDG 会话变量。

测试报告写入 `packages/vscode/.vscode-test-results/`。退出码为 0 仍不足以单独证明通过；报告中的执行数量、断言、VS Code 版本和状态也必须完整。

### 4.4 手工冒烟测试

从仓库运行 Extension Development Host，至少检查受改动影响的功能：

1. 在本仓库按 `F5` 启动 Extension Development Host。
2. 打开 `.twig` 或 `.html.twig` 文件，确认右下角语言模式为 `Twig`。
3. 执行 `TwigPlus: Show Status`，确认 formatter 和 Language Server 状态。
4. 验证格式化、补全、跳转、诊断或编辑行为。
5. 编辑行为必须额外验证单步 Undo/Redo；涉及快捷键时同时验证命令面板和快捷键入口。
6. Formatter 输入至少连续格式化三次，第二次和第三次不得继续改变内容。

## 5. 提交 Git

只暂存当前任务涉及的文件，优先显式列出路径：

```bash
git add packages/vscode/src/example.ts packages/vscode/test/example.test.ts
git diff --cached --check
git diff --cached --stat
git diff --cached
```

提交信息使用简短的祈使句，可带约定式前缀：

```bash
git commit -m "fix: keep Twig comment toggling idempotent"
```

提交后确认内容：

```bash
git show --stat --oneline HEAD
git status --short --branch
```

常用前缀：

- `fix:`：修复用户可见问题。
- `feat:`：新增功能。
- `test:`：仅增加或调整测试。
- `refactor:`：不改变外部行为的重构。
- `docs:`：仅修改文档。

## 6. 推送分支并创建 Pull Request

首次推送当前分支：

```bash
git branch --show-current
git push -u origin fix/short-description
```

创建 Draft PR：

```bash
gh pr create --draft --fill --base master
```

PR 描述至少包含：

- 根因或需求背景。
- 用户可见行为的变化。
- 主要实现方式。
- 兼容性和风险。
- 新增或修改的测试。
- 实际运行过的命令及结果。
- UI 改动的截图，或编辑/LSP/Formatter 改动的 Extension Host 报告与性能数据。

查看 PR 和 CI：

```bash
gh pr view
gh pr checks
gh pr checks --watch
```

若 CI 失败，先查看失败 job 的日志并定位根因，不要仅重复运行：

```bash
gh run list --branch "$(git branch --show-current)"
gh run view RUN_ID --log-failed
```

处理 Review 后重新运行相关测试，再提交并推送：

```bash
git add path/to/changed-file
git commit -m "fix: address review feedback"
git push
```

只有在所有必需检查通过、Review 已处理并且 PR 描述完整后，才将 Draft 标记为 Ready：

```bash
gh pr ready
```

合并策略以仓库当时的保护规则为准。合并后同步本地分支：

```bash
git switch master
git pull --ff-only origin master
```

## 7. 准备新版本

发布前先确定语义化版本：

- Patch：兼容性缺陷修复，例如 `1.2.0` → `1.2.1`。
- Minor：向后兼容的新功能，例如 `1.2.0` → `1.3.0`。
- Major：不兼容变更，例如 `1.2.0` → `2.0.0`。

从最新 `master` 创建发布分支：

```bash
git switch master
git pull --ff-only origin master
git switch -c release/vX.Y.Z
```

发布分支需要完成以下修改：

1. 将 `packages/vscode/package.json` 的 `version` 更新为 `X.Y.Z`。
2. 将 `packages/vscode/CHANGELOG.md` 的 Unreleased 内容整理到 `X.Y.Z` 版本标题下。
3. 更新与该版本相关的 README、发布说明或兼容性文档。
4. 更新锁文件：

```bash
npm install --package-lock-only
```

确认版本和锁文件差异：

```bash
node -p "require('./packages/vscode/package.json').version"
git diff -- packages/vscode/package.json package-lock.json packages/vscode/CHANGELOG.md
```

发布准备也必须通过 PR，不要直接在 `master` 修改版本或发布。

## 8. 发布前完整门禁

正式发布至少运行以下命令；Linux CI 或无桌面环境在 Extension Host 命令前加 `xvfb-run -a`：

```bash
npm ci
npm run docs:check
npm run dead-entries:check
npm run upstream-oracle:check
npm run upstream-oracle:versions
npm run upstream-oracle:symfony
npm test
npm run vscode:test:min --workspace packages/vscode
npm run vscode:test:current --workspace packages/vscode
npm run package:vsix --workspace packages/vscode
npm run vscode:test:packaged --workspace packages/vscode
npm run reports:check
```

如果本机具备仓库要求的 PHP 8.1、8.2、8.4 和 8.5 命令，还应运行核心 oracle 矩阵：

```bash
npm run upstream-oracle:core
```

依赖安全检查与 CI 一致：

```bash
npm audit --omit=dev --audit-level=high --registry=https://registry.npmjs.org
```

CI 还会重新生成固定的 Twig/Symfony oracle 快照并比较差异。涉及语言事实、Twig 版本边界或 Symfony 元数据的修改，应依赖完整 CI 矩阵作为最终验收依据。

## 9. 检查 VSIX 产物

打包命令会在 `artifacts/vsix/` 生成 `twig-plus-X.Y.Z.vsix`：

```bash
npm run package:vsix --workspace packages/vscode
npm run vsce:ls --workspace packages/vscode
unzip -l artifacts/vsix/twig-plus-X.Y.Z.vsix
sha256sum artifacts/vsix/twig-plus-X.Y.Z.vsix
```

必须确认 VSIX 至少包含：

- `extension/dist/extension.js`
- `extension/dist/server.js`
- `extension/dist/node_modules/typescript/lib/lib.dom.d.ts`

然后运行已打包扩展测试：

```bash
npm run vscode:test:packaged --workspace packages/vscode
npm run reports:check
```

本地人工安装验证可使用：

```bash
code --install-extension artifacts/vsix/twig-plus-X.Y.Z.vsix --force
```

安装后重载 VS Code，并再次验证 Twig 语言模式、格式化、补全、跳转以及本版本修复的核心场景。

## 10. 合并发布 PR、创建 Tag 和 GitHub Release

发布 PR 合并且 `master` CI 成功后，确保本地精确指向发布提交：

```bash
git switch master
git pull --ff-only origin master
git status --short --branch
git rev-parse HEAD
```

工作区必须干净。创建 annotated tag：

```bash
git tag -a vX.Y.Z -m "TwigPlus X.Y.Z"
git show --no-patch --decorate vX.Y.Z
git push origin vX.Y.Z
```

不要移动或重复使用已经发布的 tag。

使用经过测试的同一个 VSIX 创建 GitHub Release：

```bash
gh release create vX.Y.Z artifacts/vsix/twig-plus-X.Y.Z.vsix --verify-tag --title "TwigPlus X.Y.Z" --generate-notes
```

如果 VSIX 来自 GitHub Actions，先确定发布提交对应的成功 run，再下载该 run 的产物，不要混用其他提交的 artifact：

```bash
gh run list --commit "$(git rev-parse HEAD)"
gh run download RUN_ID --name twig-plus-vsix-and-test-results
```

下载后再次记录 SHA-256，并确认它与待发布产物一致。

## 11. 发布到 VS Code Marketplace

推荐直接发布已经完成 packaged Extension Host 验证的 VSIX，避免发布命令重新构建出不同产物：

```bash
npx @vscode/vsce publish --packagePath artifacts/vsix/twig-plus-X.Y.Z.vsix
```

仓库也提供以下发布脚本，但它会从当前工作区执行发布准备，因此使用前必须再次确认分支、提交和工作区状态：

```bash
npm run publish:marketplace --workspace packages/vscode
```

发布前必须确认：

```bash
git status --short --branch
git rev-parse HEAD
git describe --tags --exact-match
sha256sum artifacts/vsix/twig-plus-X.Y.Z.vsix
```

## 12. 发布后验证

发布完成后检查：

1. GitHub tag 指向发布 PR 合并后的准确提交。
2. GitHub Release 能下载 VSIX，版本和 SHA-256 正确。
3. Marketplace 显示 `X.Y.Z`，扩展 ID 为 `sohophp.twig-plus`。
4. 从 Marketplace 安装或升级后，运行 `TwigPlus: Show Status`。
5. 使用真实 `.twig` 文件执行核心冒烟测试。
6. 确认 `master` 的发布后 CI 仍为绿色。

建议在 `docs/reports/` 新增发布报告，记录：

- 发布提交 SHA 和 annotated tag。
- PR、CI run 和 GitHub Release 链接。
- Marketplace 版本。
- VSIX 文件名、大小和 SHA-256。
- 最低版、稳定版和 packaged Extension Host 报告。
- 已知限制与后续工作。

报告提交后再次运行：

```bash
npm run docs:check
```

## 13. 失败处理

- 本地测试失败：修复后重新运行相关测试，不提交已知失败结果。
- CI 基础设施失败：在 PR 中明确标记 infrastructure failure，并保留日志；不要写成产品测试通过。
- Packaged VSIX 测试失败：禁止发布，即使源码 Extension Host 测试通过。
- Marketplace 发布失败：不要修改或重打已推送 tag；先保留错误输出并确认认证、版本重复或产物问题。
- Marketplace 已发布但发现严重回归：停止继续推广，创建修复分支并发布新的 patch 版本。不要覆盖或删除已发布版本来伪造历史。

## 14. 最短命令清单

普通开发 PR：

```bash
npm run build
npm test
npm run docs:check
git diff --check
git add path/to/files
git diff --cached
git commit -m "fix: describe the change"
git push -u origin BRANCH_NAME
gh pr create --draft --fill --base master
gh pr checks --watch
```

正式版本发布：

```bash
npm ci
npm run docs:check
npm run dead-entries:check
npm run upstream-oracle:check
npm run upstream-oracle:versions
npm run upstream-oracle:symfony
npm test
npm run vscode:test:min --workspace packages/vscode
npm run vscode:test:current --workspace packages/vscode
npm run package:vsix --workspace packages/vscode
npm run vscode:test:packaged --workspace packages/vscode
npm run reports:check
sha256sum artifacts/vsix/twig-plus-X.Y.Z.vsix
git tag -a vX.Y.Z -m "TwigPlus X.Y.Z"
git push origin vX.Y.Z
gh release create vX.Y.Z artifacts/vsix/twig-plus-X.Y.Z.vsix --verify-tag --title "TwigPlus X.Y.Z" --generate-notes
npx @vscode/vsce publish --packagePath artifacts/vsix/twig-plus-X.Y.Z.vsix
```

完整测试分层和报告要求另见 [测试与验收](testing.md)，VS Code Marketplace 的专项说明见 [TwigPlus VSCode Release Guide](release-vscode.md)。
