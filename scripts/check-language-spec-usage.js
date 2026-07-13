const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sourceRoots = ["parser", "formatter", "language-server", "vscode"].map((name) => path.join(root, "packages", name, "src"));
const files = sourceRoots.flatMap(walk).filter((file) => file.endsWith(".ts"));
const forbidden = [
  /\b(?:CLOSING_TO_OPENING|OPENING_TO_CLOSING|CLOSING_TAGS|OPENING_TAGS|MIDDLE_TAGS)\b/,
  /endspaceless|endfilter/,
  /\[\s*["']endif["'][\s\S]{0,160}["']endfor["']/
];
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  for (const pattern of forbidden) if (pattern.test(source)) {
    throw new Error(`${path.relative(root, file)} duplicates Twig language facts instead of using @twig-plus/language-spec`);
  }
}
console.log(`Language-spec ownership check passed across ${files.length} source files.`);

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const item = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(item) : [item];
  });
}
