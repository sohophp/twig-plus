const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const { TWIG_3_SPEC, selectTwigSpec } = require(path.join(root, "packages/language-spec/dist/index.js"));
const check = process.argv.includes("--check");
const tags = selectTwigSpec().tags;
const opening = tags.filter((tag) => tag.closing).map((tag) => tag.name);
const closing = tags.filter((tag) => tag.form === "closing").map((tag) => tag.name);
const branches = tags.filter((tag) => tag.form === "branch").map((tag) => tag.name);

const snippets = Object.fromEntries(tags.filter((tag) => tag.form !== "closing").map((tag) => {
  const inner = tag.snippet ?? tag.name;
  const body = tag.closing
    ? [`{% ${inner} %}`, "  $0", `{% ${tag.closing} %}`]
    : [`{% ${inner} %}`];
  return [`Twig ${tag.name}`, { prefix: `twig-${tag.name}`, body, description: `${tag.source} Twig ${tag.form} tag` }];
}));

const grammarFile = path.join(root, "packages/vscode/syntaxes/twig.tmLanguage.json");
const grammar = JSON.parse(fs.readFileSync(grammarFile, "utf8"));
const keyword = grammar.repository["twig-tag"].patterns.find((pattern) => pattern.name === "keyword.control.twig");
keyword.match = `\\b(${tags.map((tag) => escapeRegex(tag.name)).join("|")})\\b`;

const configurationFile = path.join(root, "packages/vscode/language-configuration.json");
const configuration = JSON.parse(fs.readFileSync(configurationFile, "utf8"));
const openPattern = opening.join("|");
const closePattern = closing.join("|");
const branchPattern = branches.join("|");
configuration.indentationRules.increaseIndentPattern = `^\\s*(<(?!(?:/|(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)\\b))[^>]+>(?!.*</)|\\{%\\s*(${openPattern})\\b.*%\\}|\\{%\\s*(${branchPattern})\\b.*%\\})\\s*$`;
configuration.indentationRules.decreaseIndentPattern = `^\\s*(</[^>]+>|\\{%\\s*(${closePattern})\\b.*%\\}|\\{%\\s*(${branchPattern})\\b.*%\\})\\s*$`;
configuration.onEnterRules[1].beforeText = `^\\s*\\{%\\s*(${openPattern})\\b.*%\\}\\s*$`;
configuration.onEnterRules[1].afterText = `^\\s*\\{%\\s*(${closePattern})\\b.*%\\}\\s*$`;
configuration.onEnterRules[2].beforeText = `^\\s*\\{%\\s*(${branchPattern})\\b.*%\\}\\s*$`;
configuration.onEnterRules[3].beforeText = configuration.onEnterRules[1].beforeText;

writeOrCheck(path.join(root, "packages/vscode/snippets/twig.json"), snippets);
writeOrCheck(grammarFile, grammar);
writeOrCheck(configurationFile, configuration);
console.log(`${check ? "Verified" : "Generated"} Twig language assets from ${TWIG_3_SPEC.documentedVersion}.`);

function writeOrCheck(file, value) {
  const generated = `${JSON.stringify(value, null, 2)}\n`;
  if (check) {
    if (fs.readFileSync(file, "utf8") !== generated) throw new Error(`${path.relative(root, file)} is not generated from @twig-plus/language-spec`);
  } else fs.writeFileSync(file, generated);
}
function escapeRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
