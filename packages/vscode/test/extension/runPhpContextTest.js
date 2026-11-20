const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { runTests } = require("@vscode/test-electron");

async function main() {
  const core = process.env.TWIG_PLUS_TEST_PHP_CORE_PATH;
  const symfony = process.env.TWIG_PLUS_TEST_PHP_SYMFONY_PATH;
  const lifecycle = process.env.TWIG_PLUS_TEST_PHP_CONTEXT_LIFECYCLE === "1";
  const indexingMode = process.env.TWIG_PLUS_TEST_INDEXING_MODE ?? "onDemand";
  const phpVersion = process.env.TWIG_PLUS_TEST_PHP_VERSION ?? "8.5";
  assert.ok(["onDemand", "progressive"].includes(indexingMode), "Unsupported context fixture indexing mode.");
  assert.ok(["7.2", "8.5"].includes(phpVersion), "Unsupported context fixture PHP target.");
  assert.ok(core && symfony, "Set TWIG_PLUS_TEST_PHP_CORE_PATH and TWIG_PLUS_TEST_PHP_SYMFONY_PATH to built source extensions.");
  assert.ok(process.env.TWIG_PLUS_PHP_DEFINITION_REPORT, "Set TWIG_PLUS_PHP_DEFINITION_REPORT to an unused output path.");
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("VSCODE_") || key === "ELECTRON_RUN_AS_NODE" || key === "WSLENV") delete process.env[key];
  }
  process.env.DONT_PROMPT_WSL_INSTALL = "1";
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "twig-php-definition-host-"));
  try {
    for (const directory of ["src", "templates/site", "config/packages", ".vscode"]) await fs.mkdir(path.join(root, directory), { recursive: true });
    await fs.writeFile(path.join(root, "composer.json"), JSON.stringify({ autoload: { "psr-4": { "App\\": "src/" } } }));
    await fs.writeFile(path.join(root, ".vscode/settings.json"), JSON.stringify({
      "phpCompanion.languageServer.enabled": true, "phpCompanion.indexing.mode": indexingMode,
      "phpCompanion.phpVersion": phpVersion, "php.validate.enable": false,
      // Isolate semantic providers from VS Code document-word fallback (D268 control).
      ...(lifecycle ? { "editor.wordBasedSuggestions": "off" } : {})
    }));
    await fs.writeFile(path.join(root, "config/packages/twig.yaml"), 'twig:\n  paths:\n    "%kernel.project_dir%/templates/site": site\n');
    await fs.writeFile(path.join(root, "src/User.php"), "<?php\nnamespace App;\nfinal class User {\n  public function getName(): string { return 'Ada'; }\n}\n");
    await fs.writeFile(path.join(root, "src/PageController.php"), "<?php\nnamespace App;\nfinal class PageController {\n  public function show(User $person): void {\n    $this->render('plain.html.twig', ['person' => $person]);\n    $this->render('@site/page.html.twig', ['person' => $person]);\n  }\n}\n");
    if (lifecycle) await fs.writeFile(path.join(root, "src/Admin.php"), "<?php\nnamespace App;\nfinal class Admin {\n  public function getRole(): int { return 1; }\n}\n");
    if (lifecycle) await fs.writeFile(path.join(root, "src/External.php"), "<?php\nnamespace App;\nfinal class External {\n  public function getCode(): bool { return true; }\n}\n");
    for (const file of ["templates/plain.html.twig", "templates/site/page.html.twig"]) await fs.writeFile(path.join(root, file),
      lifecycle ? "{{ person.name }} {{ person.title }} {{ person.role }} {{ person.code }}\n" : "{{ person.name }}\n");
    await runTests({
      ...(process.env.TWIG_PLUS_TEST_VSCODE_EXECUTABLE ? { vscodeExecutablePath: process.env.TWIG_PLUS_TEST_VSCODE_EXECUTABLE } : { version: "1.90.2" }),
      extensionDevelopmentPath: [path.resolve(core), path.resolve(symfony), path.resolve(__dirname, "../..")],
      extensionTestsPath: path.resolve(__dirname, lifecycle ? "suite/phpContextLifecycle.js" : "suite/phpContextDefinitions.js"),
      extensionTestsEnv: {
        TWIG_PLUS_PHP_DEFINITION_REPORT: process.env.TWIG_PLUS_PHP_DEFINITION_REPORT,
        TWIG_PLUS_TEST_INDEXING_MODE: indexingMode, TWIG_PLUS_TEST_PHP_VERSION: phpVersion
      },
      launchArgs: [root, "--disable-extensions", "--disable-gpu", "--disable-workspace-trust", "--skip-welcome", "--skip-release-notes",
        `--user-data-dir=${path.join(root, "profile")}`, `--extensions-dir=${path.join(root, "extensions")}`]
    });
    const report = JSON.parse(await fs.readFile(process.env.TWIG_PLUS_PHP_DEFINITION_REPORT, "utf8"));
    assert.equal(report.status, "passed");
    assert.equal(report.checks.length, lifecycle ? 33 : 25);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
