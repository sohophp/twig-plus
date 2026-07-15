const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { pathToFileURL } = require("node:url");

const { runTests } = require("@vscode/test-electron");

async function main() {
  sanitizeHostEnvironment();
  assertGraphicalSession();
  process.env.DONT_PROMPT_WSL_INSTALL = "1";

  const extensionDevelopmentPath = path.resolve(__dirname, "../..");
  const extensionTestsPath = path.resolve(__dirname, "suite", "index.js");
  const workspacePath = path.resolve(
    extensionDevelopmentPath,
    "../../examples/basic-symfony"
  );
  const vscodeExecutablePath = getExistingVsCodeCliPath(extensionDevelopmentPath);
  const requestedVersion = process.argv[2];
  const profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), "twig-plus-vscode-profile-"));
  const resultsDirectory = path.join(extensionDevelopmentPath, ".vscode-test-results");
  fs.mkdirSync(resultsDirectory, { recursive: true });
  const reportPath = path.join(resultsDirectory, `ui-${requestedVersion ?? "default"}.json`);
  fs.rmSync(reportPath, { force: true });

  await runTests({
    ...(vscodeExecutablePath ? { vscodeExecutablePath } : { version: requestedVersion ?? "stable" }),
    extensionDevelopmentPath,
    extensionTestsPath,
    extensionTestsEnv: { TWIG_PLUS_UI_REPORT: reportPath },
    launchArgs: [
      `--folder-uri=${pathToFileURL(workspacePath).href}`,
      "--disable-extensions",
      "--disable-gpu",
      "--disable-workspace-trust",
      "--skip-welcome",
      "--skip-release-notes",
      `--user-data-dir=${path.join(profileRoot, "user-data")}`,
      `--extensions-dir=${path.join(profileRoot, "extensions")}`
    ]
  });
  if (!fs.existsSync(reportPath)) throw new Error("Extension Host exited without writing a UI test report.");
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  if (report.passed !== report.expected || report.tests.some((test) => test.status !== "passed")) {
    throw new Error(`Incomplete Extension Host test run: ${JSON.stringify(report)}`);
  }
  fs.writeFileSync(reportPath, JSON.stringify({
    ...report,
    kind: requestedVersion === "1.90.2" ? "minimum" : requestedVersion === "stable" ? "current" : "development",
    requestedVersion: requestedVersion ?? "stable",
    verifiedAt: new Date().toISOString()
  }, null, 2));
  console.log(`[TwigPlus UI] VERIFIED ${report.passed}/${report.expected} tests on VS Code ${report.vscodeVersion}`);
  console.log(`[TwigPlus UI] Report: ${reportPath}`);
}

function sanitizeHostEnvironment() {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("VSCODE_") || key === "ELECTRON_RUN_AS_NODE" || key === "WSLENV") delete process.env[key];
  }
  if (process.env.XDG_RUNTIME_DIR && !fs.existsSync(process.env.XDG_RUNTIME_DIR)) {
    delete process.env.XDG_RUNTIME_DIR;
  }
  const dbusAddress = process.env.DBUS_SESSION_BUS_ADDRESS;
  const dbusSocket = dbusAddress?.match(/(?:^|;)unix:path=([^,;]+)/)?.[1];
  if ((dbusAddress && !/^(?:unix|tcp):/.test(dbusAddress)) || (dbusSocket && !fs.existsSync(dbusSocket))) {
    delete process.env.DBUS_SESSION_BUS_ADDRESS;
  }
}

function assertGraphicalSession() {
  if (process.platform !== "linux") return;
  const display = process.env.DISPLAY;
  if (!display && !process.env.WAYLAND_DISPLAY) {
    throw new Error("No graphical display is available. Run this test under xvfb-run on headless Linux.");
  }
  const localDisplay = display?.match(/^:(\d+)(?:\.\d+)?$/)?.[1];
  if (localDisplay && !fs.existsSync(`/tmp/.X11-unix/X${localDisplay}`)) {
    throw new Error(
      `DISPLAY=${display} has no X11 socket. Check whether /tmp/.X11-unix is a broken symlink and whether Xvfb is still running.`
    );
  }
}

function getExistingVsCodeCliPath(extensionDevelopmentPath) {
  if (process.argv[2] === "stable") return null;
  const cachePath = path.join(extensionDevelopmentPath, ".vscode-test");

  if (!fs.existsSync(cachePath)) {
    return null;
  }

  const requestedVersion = process.argv[2];
  const candidates = fs
    .readdirSync(cachePath)
    .filter((entry) => entry.startsWith("vscode-linux-x64-"))
    .map((entry) => ({ entry, version: entry.replace("vscode-linux-x64-", "") }))
    .filter((item) => !requestedVersion || requestedVersion === "stable" || item.version === requestedVersion)
    .sort((left, right) => compareVersions(right.version, left.version))
    .flatMap((item) => [
      path.join(cachePath, item.entry, "code"),
      path.join(cachePath, item.entry, "bin", "code")
    ]);

  return candidates.find((entryPath) => fs.existsSync(entryPath)) ?? null;
}

function compareVersions(left, right) {
  const a = left.split(".").map(Number); const b = right.split(".").map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) - (b[index] ?? 0);
  }
  return 0;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
