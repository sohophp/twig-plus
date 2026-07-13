const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const directory = path.join(root, "packages", "vscode", ".vscode-test-results");
const expected = [
  ["ui-1.90.2.json", "minimum"],
  ["ui-stable.json", "current"],
  ["ui-packaged.json", "packaged-vsix"]
];
const replay = JSON.parse(fs.readFileSync(path.join(root, "packages", "vscode", "test", "input-replays.json"), "utf8"));
const requiredExtensionHostTests = replay.scenarios.map((scenario) => scenario.extensionHostTest).filter(Boolean);

for (const [name, kind] of expected) {
  const file = path.join(directory, name);
  if (!fs.existsSync(file)) throw new Error(`Missing required UI report: ${name}`);
  const report = JSON.parse(fs.readFileSync(file, "utf8"));
  if (report.kind !== kind || report.passed !== report.expected || !Array.isArray(report.tests) || report.tests.length !== report.expected) {
    throw new Error(`Invalid or incomplete UI report ${name}: ${JSON.stringify(report)}`);
  }
  if (report.tests.some((test) => test.status !== "passed")) throw new Error(`Failed UI assertion recorded in ${name}`);
  const names = new Set(report.tests.map((test) => test.name));
  const missingReplays = requiredExtensionHostTests.filter((test) => !names.has(test));
  if (missingReplays.length) throw new Error(`${name} is missing input replay owners: ${missingReplays.join(", ")}`);
  if (kind === "packaged-vsix" && (!report.artifact || !report.artifactSha256)) throw new Error("Packaged report is missing artifact identity.");
}

const integrationSource = fs.readFileSync(path.join(root, "tests", "integration", "languageServerIntegration.test.ts"), "utf8");
for (const scenario of replay.scenarios.filter((entry) => entry.integrationTest)) {
  if (!integrationSource.includes(scenario.integrationTest)) throw new Error(`Missing integration owner for replay ${scenario.id}: ${scenario.integrationTest}`);
}

console.log(`UI reports and ${replay.scenarios.length} input replays verified: ${expected.map(([name]) => name).join(", ")}`);
