const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const versions = ["6.4", "7.4", "8.1"];
const expectedReferences = {
  route: ["symfony/routing"], asset: ["symfony/asset"], translation: ["symfony/translation"],
  form: ["symfony/form"], security: ["symfony/security-core"], fragment: ["symfony/http-kernel"],
  importmap: ["symfony/asset-mapper"]
};
const snapshots = new Map();

for (const version of versions) {
  const file = path.join(root, `packages/language-spec/src/generated/symfony/symfony-${version}.json`);
  const snapshot = JSON.parse(fs.readFileSync(file, "utf8"));
  if (snapshot.schemaVersion !== 1) throw new Error(`Symfony ${version} has an unsupported snapshot schema.`);
  if (!snapshot.symfony?.version?.startsWith(`${version}.`)) throw new Error(`Symfony ${version} snapshot reports ${snapshot.symfony?.version}.`);
  if (!/^[0-9a-f]{40}$/.test(snapshot.symfony?.commit ?? "")) throw new Error(`Symfony ${version} lacks an exact Twig Bridge commit.`);
  for (const packageName of Object.values(expectedReferences).flat()) {
    if (!snapshot.packages[packageName]) throw new Error(`Symfony ${version} is missing required package ${packageName}.`);
  }
  for (const [kind, packages] of Object.entries(expectedReferences)) {
    if (JSON.stringify(snapshot.references[kind]) !== JSON.stringify(packages)) throw new Error(`Symfony ${version} has invalid ${kind} reference ownership.`);
  }
  const keys = snapshot.callables.map((entry) => `${entry.kind}:${entry.name}:${entry.package}`);
  if (new Set(keys).size !== keys.length) throw new Error(`Symfony ${version} contains duplicate callable facts.`);
  snapshots.set(version, snapshot);
}

const facts = (version) => new Set(snapshots.get(version).callables.map((entry) => `${entry.kind}:${entry.name}:${entry.package}`));
const boundaries = [
  ["6.4", "function:access_decision:symfony/security-core", false],
  ["7.4", "function:access_decision:symfony/security-core", true],
  ["7.4", "function:form_flow_steps:symfony/form", false],
  ["8.1", "function:form_flow_steps:symfony/form", true]
];
for (const [version, fact, expected] of boundaries) {
  if (facts(version).has(fact) !== expected) throw new Error(`${fact} availability at Symfony ${version} should be ${expected}.`);
}

console.log(`Verified ${versions.length} pinned Symfony runtime snapshots and ${boundaries.length} package-aware boundaries.`);
