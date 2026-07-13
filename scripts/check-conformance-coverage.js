const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const corpus = JSON.parse(fs.readFileSync(path.join(root, "tools/upstream-oracle/conformance.json"), "utf8"));
const docs = JSON.parse(fs.readFileSync(path.join(root, "packages/language-spec/src/generated/official-docs.json"), "utf8"));
const ids = new Set();
const features = new Set();

for (const entry of corpus.cases) {
  if (ids.has(entry.id)) throw new Error(`Duplicate conformance case id: ${entry.id}`);
  ids.add(entry.id);
  if (entry.valid) features.add(entry.feature);
}

const missingTags = docs.twig.tags.filter((name) => !features.has(`tag:${name}`));
if (missingTags.length) throw new Error(`Official Twig tags missing positive parser cases: ${missingTags.join(", ")}`);
if (!corpus.cases.some((entry) => !entry.valid)) throw new Error("Conformance corpus must contain recovery cases.");

console.log(`Verified ${corpus.cases.length} Twig 3.28 conformance cases; official tag coverage ${docs.twig.tags.length}/${docs.twig.tags.length}.`);
