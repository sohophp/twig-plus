const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const versions = ["3.0", "3.8", "3.12", "3.15", "3.21", "3.23", "3.26", "3.28"];
const { getTwigCallable, getTwigOperator, getTwigTag } = require(path.join(root, "packages/language-spec/dist/index.js"));
const { selectTwigSpec } = require(path.join(root, "packages/language-spec/dist/index.js"));
const exceptions = require(path.join(root, "tools/upstream-oracle/version-fact-exceptions.json"));
const observedExceptions = { languageOnly: new Set(), oracleOnly: new Set() };

for (const version of versions) {
  const snapshot = require(path.join(root, `packages/language-spec/src/generated/versions/twig-${version}.json`));
  if (!snapshot.twig.version.startsWith(`${version}.`)) throw new Error(`Twig ${version} snapshot reports ${snapshot.twig.version}.`);
  if (!/^[0-9a-f]{40}$/.test(snapshot.twig.commit ?? "")) throw new Error(`Twig ${version} snapshot lacks an exact source commit.`);
  for (const kind of ["filter", "function", "test"]) {
    const names = snapshot.callables[kind].map((entry) => entry.name);
    if (new Set(names).size !== names.length) throw new Error(`Twig ${version} has duplicate ${kind} facts.`);
  }
  const selected = selectTwigSpec(version);
  const actual = {
    tag: selected.tags.filter((entry) => entry.source === "twig-core" && !["branch", "closing"].includes(entry.form)).map((entry) => entry.name),
    filter: selected.callables.filter((entry) => entry.source === "twig-core" && entry.kind === "filter").map((entry) => entry.name),
    function: selected.callables.filter((entry) => entry.source === "twig-core" && entry.kind === "function").map((entry) => entry.name),
    test: selected.callables.filter((entry) => entry.source === "twig-core" && entry.kind === "test").map((entry) => entry.name),
    operator: selected.operators.filter((entry) => entry.source === "twig-core").map((entry) => entry.name)
  };
  const expected = {
    tag: snapshot.tags.map((entry) => entry.name),
    filter: snapshot.callables.filter.map((entry) => entry.name),
    function: snapshot.callables.function.map((entry) => entry.name),
    test: snapshot.callables.test.map((entry) => entry.name),
    operator: snapshot.operators.map((entry) => entry.name)
  };
  for (const kind of Object.keys(actual)) {
    const languageOnly = actual[kind].filter((name) => {
      if (expected[kind].includes(name)) return false;
      if (exceptions.languageOnly[kind]?.[name]) { observedExceptions.languageOnly.add(`${kind}:${name}`); return false; }
      return true;
    });
    const oracleOnly = expected[kind].filter((name) => {
      if (actual[kind].includes(name)) return false;
      if (exceptions.oracleOnly[kind]?.[name]) { observedExceptions.oracleOnly.add(`${kind}:${name}`); return false; }
      return true;
    });
    if (languageOnly.length || oracleOnly.length) throw new Error(`Twig ${version} ${kind} drift: language-only=${languageOnly.join(",")} oracle-only=${oracleOnly.join(",")}.`);
  }
}
for (const direction of ["languageOnly", "oracleOnly"]) for (const [kind, entries] of Object.entries(exceptions[direction])) {
  for (const [name, reason] of Object.entries(entries)) {
    if (!String(reason).trim()) throw new Error(`Unexplained ${direction} exception ${kind}:${name}.`);
    if (!observedExceptions[direction].has(`${kind}:${name}`)) throw new Error(`Stale ${direction} exception ${kind}:${name}.`);
  }
}

const boundaries = [
  ["operator", "has some", "3.0", false], ["operator", "has some", "3.8", true],
  ["operator", "...", "3.0", false], ["operator", "...", "3.8", true],
  ["filter", "find", "3.8", false], ["filter", "find", "3.12", true],
  ["test", "mapping", "3.8", false], ["test", "mapping", "3.12", true],
  ["tag", "types", "3.12", false], ["tag", "types", "3.15", true],
  ["tag", "guard", "3.12", false], ["tag", "guard", "3.15", true],
  ["filter", "invoke", "3.15", false], ["filter", "invoke", "3.21", true],
  ["operator", "=", "3.21", false], ["operator", "=", "3.23", true],
  ["operator", "===", "3.21", false], ["operator", "===", "3.23", true]
];
for (const [kind, name, version, expected] of boundaries) {
  const fact = kind === "tag" ? getTwigTag(name, version)
    : kind === "operator" ? getTwigOperator(name, version) : getTwigCallable(kind, name, version);
  if (Boolean(fact) !== expected) throw new Error(`${kind}:${name} availability at Twig ${version} should be ${expected}.`);
}

console.log(`Verified ${versions.length} pinned Twig runtime snapshots and ${boundaries.length} language-spec boundaries.`);
