const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const roots = ["packages/parser/src", "packages/formatter/src", "packages/language-server/src", "packages/vscode/src"];
const files = roots.flatMap((entry) => walk(path.join(root, entry))).filter((file) => /\.(?:ts|js|json)$/.test(file));
files.push(path.join(root, "packages/vscode/package.json"));

const forbidden = [
  "ParserEngine",
  "hybrid-shadow",
  "hybridCompatibility",
  "formatLegacyDocument",
  "twigPlus.parser.engine",
  "twigPlus.selectParserEngine",
  /(?:get|collect|analyze)Compatible[A-Za-z]+/
];

for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  for (const token of forbidden) {
    if (typeof token === "string" ? source.includes(token) : token.test(source)) {
      throw new Error(`Removed parser compatibility entry returned in ${path.relative(root, file)}: ${String(token)}`);
    }
  }
}

console.log(`Pure-Hybrid guard passed across ${files.length} runtime files.`);

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}
