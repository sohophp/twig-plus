const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { pathToFileURL } = require("node:url");
const { runTests } = require("@vscode/test-electron");

async function main() {
  sanitizeHostEnvironment();
  process.env.DONT_PROMPT_WSL_INSTALL = "1";
  const packageRoot = path.resolve(__dirname, "../..");
  const workspaceRoot = path.resolve(packageRoot, "../..");
  const artifactDirectory = path.join(workspaceRoot, "artifacts", "vsix");
  const vsix = fs.existsSync(artifactDirectory)
    ? fs.readdirSync(artifactDirectory).filter((name) => name.endsWith(".vsix")).sort().at(-1)
    : undefined;
  if (!vsix) throw new Error(`No VSIX found in ${artifactDirectory}. Run package:vsix before the packaged extension test.`);
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "twig-plus-vsix-"));
  try {
    execFileSync("unzip", ["-q", path.join(artifactDirectory, vsix), "-d", temporaryDirectory]);
    const extensionDevelopmentPath = path.join(temporaryDirectory, "extension");
    const extensionTestsPath = path.join(packageRoot, "test", "extension", "suite", "index.js");
    const reportPath = path.join(temporaryDirectory, "ui-report.json");
    const resultsDirectory = path.join(packageRoot, ".vscode-test-results");
    const persistentReportPath = path.join(resultsDirectory, "ui-packaged.json");
    const workspacePath = path.join(workspaceRoot, "examples", "basic-symfony");
    const vscodeExecutablePath = getExistingVsCodeCliPath(packageRoot);
    const profileRoot = path.join(temporaryDirectory, "vscode-profile");
    await runTests({
      ...(vscodeExecutablePath ? { vscodeExecutablePath } : { version: "1.90.2" }),
      extensionDevelopmentPath,
      extensionTestsPath,
      extensionTestsEnv: { TWIG_PLUS_UI_REPORT: reportPath },
      launchArgs: [
        `--folder-uri=${pathToFileURL(workspacePath).href}`, "--disable-extensions",
        `--user-data-dir=${path.join(profileRoot, "user-data")}`,
        `--extensions-dir=${path.join(profileRoot, "extensions")}`
      ]
    });
    if (!fs.existsSync(reportPath)) throw new Error("Packaged Extension Host exited without writing a UI test report.");
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    if (report.passed !== report.expected) throw new Error(`Incomplete packaged UI test run: ${JSON.stringify(report)}`);
    fs.mkdirSync(resultsDirectory, { recursive: true });
    fs.writeFileSync(persistentReportPath, JSON.stringify({
      ...report,
      kind: "packaged-vsix",
      artifact: path.relative(workspaceRoot, path.join(artifactDirectory, vsix)).replaceAll(path.sep, "/"),
      artifactSha256: createHash("sha256").update(fs.readFileSync(path.join(artifactDirectory, vsix))).digest("hex"),
      verifiedAt: new Date().toISOString()
    }, null, 2));
    console.log(`[TwigPlus UI] PACKAGED VERIFIED ${report.passed}/${report.expected} tests on VS Code ${report.vscodeVersion}`);
    console.log(`[TwigPlus UI] Report: ${persistentReportPath}`);
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function sanitizeHostEnvironment() {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("VSCODE_") || key === "ELECTRON_RUN_AS_NODE" || key === "WSLENV") delete process.env[key];
  }
}

function getExistingVsCodeCliPath(packageRoot) {
  const cachePath = path.join(packageRoot, ".vscode-test");
  if (!fs.existsSync(cachePath)) return null;
  return fs.readdirSync(cachePath)
    .filter((entry) => entry.startsWith("vscode-linux-x64-"))
    .map((entry) => ({ entry, version: entry.replace("vscode-linux-x64-", "") }))
    .sort((left, right) => compareVersions(right.version, left.version))
    .flatMap((item) => [path.join(cachePath, item.entry, "code"), path.join(cachePath, item.entry, "bin", "code")])
    .find((entry) => fs.existsSync(entry)) ?? null;
}

function compareVersions(left, right) {
  const a = left.split(".").map(Number); const b = right.split(".").map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) - (b[index] ?? 0);
  }
  return 0;
}

main().catch((error) => { console.error(error); process.exit(1); });
