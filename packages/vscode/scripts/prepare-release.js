const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

const packageRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(packageRoot, "..", "..");
const distNodeModulesRoot = path.join(packageRoot, "dist", "node_modules");
const extensionEntrypoint = path.join(packageRoot, "dist", "extension.js");
const serverEntrypoint = path.join(packageRoot, "dist", "server.js");

prepareReleasePackage();

function prepareReleasePackage() {
  fs.rmSync(path.join(packageRoot, "node_modules"), { force: true, recursive: true });
  fs.rmSync(distNodeModulesRoot, { force: true, recursive: true });
  copyExternalPackageToDist("prettier");
  copyExternalPackageToDist("typescript");
  copyExternalPackageToDist("vscode-html-languageservice");
  copyExternalPackageToDist("vscode-languageserver-textdocument");
  copyExternalPackageToDist("vscode-languageserver-types");
  copyExternalPackageToDist("vscode-uri");
  copyExternalPackageToDist("@vscode/l10n");
  assertBundledEntrypoint();
}

function assertBundledEntrypoint() {
  if (!fs.existsSync(extensionEntrypoint)) {
    throw new Error(
      "Missing dist/extension.js. Run npm run build before packaging the VSCode extension."
    );
  }
  if (!fs.existsSync(serverEntrypoint)) {
    throw new Error("Missing dist/server.js. Run npm run build before packaging the VSCode extension.");
  }

  const bundledSource = fs.readFileSync(extensionEntrypoint, "utf8");
  const forbiddenRuntimeRequires = [
    "require(\"@twig-plus/parser\")",
    "require('@twig-plus/parser')",
    "require(\"@twig-plus/formatter\")",
    "require('@twig-plus/formatter')",
    "./parser/htmlScanner"
  ];

  for (const runtimeRequire of forbiddenRuntimeRequires) {
    if (bundledSource.includes(runtimeRequire)) {
      throw new Error(
        `dist/extension.js still contains ${runtimeRequire}. Run npm run build so runtime dependencies are bundled.`
      );
    }
  }

  const extensionRequire = createRequire(extensionEntrypoint);
  extensionRequire.resolve("prettier");
  extensionRequire.resolve("vscode-html-languageservice");
  extensionRequire.resolve("vscode-languageserver-textdocument");
  createRequire(serverEntrypoint).resolve("typescript");
}

function copyExternalPackageToDist(packageName) {
  const sourceRoot = path.join(workspaceRoot, "node_modules", packageName);
  const targetRoot = path.join(distNodeModulesRoot, packageName);

  if (!fs.existsSync(sourceRoot)) {
    throw new Error(
      `Missing runtime dependency ${packageName}. Run npm install before packaging the VSCode extension.`
    );
  }

  fs.cpSync(sourceRoot, targetRoot, {
    recursive: true,
    filter: (sourcePath) =>
      !sourcePath.includes(`${path.sep}.cache${path.sep}`) &&
      !sourcePath.endsWith(`${path.sep}.DS_Store`)
  });
}
