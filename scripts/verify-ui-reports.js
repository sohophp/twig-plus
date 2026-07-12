const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const directory = path.join(root, "packages", "vscode", ".vscode-test-results");
const expected = [
  ["ui-1.90.2.json", "minimum"],
  ["ui-stable.json", "current"],
  ["ui-packaged.json", "packaged-vsix"]
];

for (const [name, kind] of expected) {
  const file = path.join(directory, name);
  if (!fs.existsSync(file)) throw new Error(`Missing required UI report: ${name}`);
  const report = JSON.parse(fs.readFileSync(file, "utf8"));
  if (report.kind !== kind || report.passed !== report.expected || !Array.isArray(report.tests) || report.tests.length !== report.expected) {
    throw new Error(`Invalid or incomplete UI report ${name}: ${JSON.stringify(report)}`);
  }
  if (report.tests.some((test) => test.status !== "passed")) throw new Error(`Failed UI assertion recorded in ${name}`);
  if (kind === "packaged-vsix" && (!report.artifact || !report.artifactSha256)) throw new Error("Packaged report is missing artifact identity.");
}

console.log(`UI reports verified: ${expected.map(([name]) => name).join(", ")}`);
