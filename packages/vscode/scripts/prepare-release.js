const fs = require("node:fs");
const path = require("node:path");

const packageRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(packageRoot, "..", "..");
const packageNodeModulesRoot = path.join(packageRoot, "node_modules");
const vendorRoot = path.join(packageRoot, "node_modules", "@twig-plus");

prepareReleasePackage();

function prepareReleasePackage() {
  ensureBuiltPackage(path.join(workspaceRoot, "packages", "parser", "dist"), "parser");
  ensureBuiltPackage(path.join(workspaceRoot, "packages", "formatter", "dist"), "formatter");

  fs.rmSync(packageNodeModulesRoot, { force: true, recursive: true });
  fs.mkdirSync(vendorRoot, { recursive: true });

  copyWorkspacePackage("parser");
  copyWorkspacePackage("formatter");
  copyExternalPackage("prettier");
}

function copyWorkspacePackage(packageName) {
  const sourceRoot = path.join(workspaceRoot, "packages", packageName);
  const targetRoot = path.join(vendorRoot, packageName);

  fs.mkdirSync(targetRoot, { recursive: true });
  fs.cpSync(path.join(sourceRoot, "dist"), path.join(targetRoot, "dist"), {
    recursive: true
  });

  const sourcePackageJson = JSON.parse(
    fs.readFileSync(path.join(sourceRoot, "package.json"), "utf8")
  );

  const publishedPackageJson = {
    name: sourcePackageJson.name,
    version: sourcePackageJson.version,
    main: sourcePackageJson.main,
    types: sourcePackageJson.types
  };

  if (sourcePackageJson.dependencies) {
    publishedPackageJson.dependencies = sourcePackageJson.dependencies;
  }

  fs.writeFileSync(
    path.join(targetRoot, "package.json"),
    `${JSON.stringify(publishedPackageJson, null, 2)}\n`
  );
}

function copyExternalPackage(packageName) {
  const sourceRoot = path.join(workspaceRoot, "node_modules", packageName);
  const targetRoot = path.join(packageNodeModulesRoot, packageName);

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

function ensureBuiltPackage(distPath, packageName) {
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Missing built dist for ${packageName}. Run npm run build before packaging the VSCode extension.`
    );
  }
}
