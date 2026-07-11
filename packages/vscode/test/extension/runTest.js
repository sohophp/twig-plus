const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");

const { runTests } = require("@vscode/test-electron");

async function main() {
  delete process.env.VSCODE_IPC_HOOK_CLI;
  process.env.DONT_PROMPT_WSL_INSTALL = "1";

  const extensionDevelopmentPath = path.resolve(__dirname, "../..");
  const extensionTestsPath = path.resolve(__dirname, "suite", "index.js");
  const workspacePath = path.resolve(
    extensionDevelopmentPath,
    "../../examples/basic-symfony"
  );
  const vscodeExecutablePath = getExistingVsCodeCliPath(extensionDevelopmentPath);

  await runTests({
    ...(vscodeExecutablePath ? { vscodeExecutablePath } : { version: "1.90.2" }),
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: [
      `--folder-uri=${pathToFileURL(workspacePath).href}`,
      "--disable-extensions"
    ]
  });
}

function getExistingVsCodeCliPath(extensionDevelopmentPath) {
  const cachePath = path.join(extensionDevelopmentPath, ".vscode-test");

  if (!fs.existsSync(cachePath)) {
    return null;
  }

  const candidate = fs
    .readdirSync(cachePath)
    .filter((entry) => entry.startsWith("vscode-linux-x64-"))
    .sort()
    .reverse()
    .map((entry) => path.join(cachePath, entry, "bin", "code"))
    .find((entryPath) => fs.existsSync(entryPath));

  return candidate ?? null;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
