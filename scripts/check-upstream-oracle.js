const path = require("node:path");

const root = path.resolve(__dirname, "..");
const oracle = require(path.join(root, "packages/language-spec/src/generated/upstream-runtime.json"));
const docs = require(path.join(root, "packages/language-spec/src/generated/official-docs.json"));
const { TWIG_3_SPEC, selectTwigSpec } = require(path.join(root, "packages/language-spec/dist/index.js"));
const activeSpec = selectTwigSpec(oracle.twig.version);

if (TWIG_3_SPEC.schemaVersion !== 2) throw new Error("TwigLanguageSpec schema v2 is required.");
if (TWIG_3_SPEC.upstream.twig.version !== oracle.twig.version || TWIG_3_SPEC.upstream.twig.commit !== oracle.twig.commit) {
  throw new Error("Twig upstream version/commit differs from the checked runtime oracle.");
}

const primaryTags = activeSpec.tags
  .filter((tag) => tag.form === "inline" || tag.form === "block" || tag.form === "conditional-block")
  .map((tag) => tag.name);
compare("tags", oracle.tags.map((tag) => tag.name), primaryTags, { specOnlyAllowed: ["verbatim"] });

for (const kind of ["filter", "function", "test"]) {
  const upstream = oracle.callables[kind].map((entry) => entry.name).filter((name) => name !== "format_*_number");
  const spec = TWIG_3_SPEC.callables.filter((entry) => entry.kind === kind && entry.source !== "symfony-bridge").map((entry) => entry.name);
  compare(`${kind}s`, upstream, spec);
}

compare("documented tags", docs.twig.tags, activeSpec.tags
  .filter((entry) => entry.form === "inline" || entry.form === "block" || entry.form === "conditional-block")
  .filter((entry) => entry.documented !== false).map((entry) => entry.name));
for (const [plural, kind] of [["filters", "filter"], ["functions", "function"], ["tests", "test"]]) {
  compare(`documented ${plural}`, docs.twig[plural], activeSpec.callables
    .filter((entry) => entry.kind === kind && entry.source !== "symfony-bridge" && entry.documented !== false).map((entry) => entry.name));
}
const documentedOperators = new Set(activeSpec.operators.flatMap((entry) => [entry.name, ...(entry.aliases ?? [])]));
const missingDocumentedOperators = docs.twig.operators.filter((name) => !documentedOperators.has(name));
if (missingDocumentedOperators.length) throw new Error(`Documented operators missing from spec: ${missingDocumentedOperators.join(", ")}`);

const upstreamOperators = new Set(oracle.operators.flatMap((operator) => [operator.name, ...operator.aliases]));
for (const operator of TWIG_3_SPEC.operators) {
  if (!upstreamOperators.has(operator.name)) throw new Error(`Operator '${operator.name}' is absent from the Twig runtime oracle.`);
}

console.log(`Twig upstream oracle verified: ${oracle.tags.length} tags, ${Object.values(oracle.callables).flat().length} callables, ${oracle.operators.length} expression parsers.`);

function compare(label, upstreamValues, specValues, options = {}) {
  const upstream = new Set(upstreamValues);
  const spec = new Set(specValues);
  const missing = [...upstream].filter((value) => !spec.has(value));
  const allowed = new Set(options.specOnlyAllowed ?? []);
  const extra = [...spec].filter((value) => !upstream.has(value) && !allowed.has(value));
  if (missing.length || extra.length) {
    throw new Error(`${label} differ from upstream; missing=[${missing.join(", ")}], extra=[${extra.join(", ")}]`);
  }
}
