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

function ensureBuiltPackage(distPath, packageName) {
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Missing built dist for ${packageName}. Run npm run build before packaging the VSCode extension.`
    );
  }
}
