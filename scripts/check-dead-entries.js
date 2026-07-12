const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const files = walk(path.join(root, "packages", "vscode", "src")).filter((file) => file.endsWith(".ts"));
const source = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");
for (const forbidden of ["twigPlus.deleteLeft", "registerTwigCompletionProvider", "getTwigAutoCloseEdit", "autoInsertClosingTag"]) {
  if (source.includes(forbidden)) throw new Error(`Dead editing entry returned: ${forbidden}`);
}
console.log(`Dead-entry check passed across ${files.length} VS Code source files.`);

const suitePath = path.join(root, "packages", "vscode", "test", "extension", "suite", "index.js");
const suite = fs.readFileSync(suitePath, "utf8");
const testList = suite.match(/const tests = \[([\s\S]*?)\];/)?.[1] ?? "";
const registered = new Set([...testList.matchAll(/\b(test[A-Za-z0-9_]+)/g)].map((match) => match[1]));
const declared = [...suite.matchAll(/async function (test[A-Za-z0-9_]+)/g)].map((match) => match[1]);
const unusedTests = declared.filter((name) => !registered.has(name));
if (unusedTests.length) throw new Error(`UI tests declared but not executed: ${unusedTests.join(", ")}`);

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}
