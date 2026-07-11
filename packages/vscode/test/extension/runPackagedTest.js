const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const { runTests } = require("@vscode/test-electron");

async function main() {
  delete process.env.VSCODE_IPC_HOOK_CLI;
  process.env.DONT_PROMPT_WSL_INSTALL = "1";
  const packageRoot = path.resolve(__dirname, "../..");
  const workspaceRoot = path.resolve(packageRoot, "../..");
  const vsix = fs.readdirSync(packageRoot).filter((name) => name.endsWith(".vsix")).sort().at(-1);
  if (!vsix) throw new Error("No VSIX found. Run package:vsix before the packaged extension test.");
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "twig-plus-vsix-"));
  try {
    execFileSync("unzip", ["-q", path.join(packageRoot, vsix), "-d", temporaryDirectory]);
    const extensionDevelopmentPath = path.join(temporaryDirectory, "extension");
    const extensionTestsPath = path.join(packageRoot, "test", "extension", "suite", "index.js");
    const workspacePath = path.join(workspaceRoot, "examples", "basic-symfony");
    const vscodeExecutablePath = getExistingVsCodeCliPath(packageRoot);
    await runTests({
      ...(vscodeExecutablePath ? { vscodeExecutablePath } : { version: "1.90.2" }),
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [`--folder-uri=${pathToFileURL(workspacePath).href}`, "--disable-extensions"]
    });
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function getExistingVsCodeCliPath(packageRoot) {
  const cachePath = path.join(packageRoot, ".vscode-test");
  if (!fs.existsSync(cachePath)) return null;
  return fs.readdirSync(cachePath)
    .filter((entry) => entry.startsWith("vscode-linux-x64-"))
    .sort().reverse()
    .map((entry) => path.join(cachePath, entry, "bin", "code"))
    .find((entry) => fs.existsSync(entry)) ?? null;
}

main().catch((error) => { console.error(error); process.exit(1); });
