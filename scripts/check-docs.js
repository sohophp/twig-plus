const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const required = [
  "README.md", "docs/product.md", "docs/architecture.md", "docs/editing-model.md",
  "docs/formatting.md", "docs/testing.md", "docs/troubleshooting.md", "docs/roadmap.md",
  "docs/release-vscode.md", "docs/decisions/README.md", "docs/decisions/0001-stable-delimiter-input.md"
];

for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing required documentation: ${file}`);
}

for (const file of required) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  for (const match of source.matchAll(/\[[^\]]+\]\(([^)#]+)(?:#[^)]+)?\)/g)) {
    const target = match[1];
    if (/^[a-z]+:/i.test(target)) continue;
    const resolved = path.resolve(path.dirname(path.join(root, file)), target);
    if (!fs.existsSync(resolved)) throw new Error(`Broken documentation link in ${file}: ${target}`);
  }
}

console.log(`Documentation verified: ${required.length} required files and local links.`);
