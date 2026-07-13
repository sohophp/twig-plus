const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const packageRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(packageRoot, "../..");
const outputDirectory = path.join(workspaceRoot, "artifacts", "vsix");
const manifest = require(path.join(packageRoot, "package.json"));
const outputPath = path.join(outputDirectory, `${manifest.name}-${manifest.version}.vsix`);

fs.mkdirSync(outputDirectory, { recursive: true });

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(
  command,
  ["@vscode/vsce", "package", "--no-dependencies", "--out", outputPath],
  { cwd: packageRoot, stdio: "inherit" }
);

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

console.log(`[TwigPlus] VSIX artifact: ${outputPath}`);
