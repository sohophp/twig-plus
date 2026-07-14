import upstreamRuntime from "./generated/upstream-runtime.json";
import symfony64Runtime from "./generated/symfony/symfony-6.4.json";
import symfony74Runtime from "./generated/symfony/symfony-7.4.json";
import symfony81Runtime from "./generated/symfony/symfony-8.1.json";

export type TwigSpecSource = "twig-core" | "twig-legacy" | "twig-extra" | "symfony-bridge" | "project";
export type TwigCallableKind = "filter" | "function" | "test";
export type TwigTagForm = "inline" | "block" | "conditional-block" | "branch" | "closing";

export interface VersionedTwigFact {
  since?: string;
  removed?: string;
  deprecated?: string;
  source: TwigSpecSource;
  documented?: boolean;
  docsUrl?: string;
  upstreamClass?: string;
  aliases?: readonly string[];
  alwaysAllowedInSandbox?: boolean;
  package?: string;
}

export interface TwigTagSpec extends VersionedTwigFact {
  name: string;
  form: TwigTagForm;
  closing?: string;
  opens?: string;
  branches?: readonly string[];
  snippet?: string;
}

export interface TwigCallableSpec extends VersionedTwigFact {
  kind: TwigCallableKind;
  name: string;
  signature?: string;
  documentation?: string;
  allowsUndefinedInput?: boolean;
}

export interface TwigOperatorSpec extends VersionedTwigFact {
  name: string;
  precedence: number;
  associativity: "left" | "right";
  fixity?: "prefix" | "infix" | "postfix";
  allowsUndefinedInput?: boolean;
}

export interface TwigLanguageSpec {
  schemaVersion: 2;
  documentedVersion: string;
  upstream: {
    twig: { version: string; tag: string; commit: string };
    symfony: { version: string; tag: string; commit: string };
  };
  tags: readonly TwigTagSpec[];
  callables: readonly TwigCallableSpec[];
  operators: readonly TwigOperatorSpec[];
  globals: readonly string[];
}

const core = { source: "twig-core" as const };
const block = (name: string, closing: string, branches: readonly string[] = [], snippet?: string): TwigTagSpec =>
  ({ ...core, name, form: "block", closing, branches, snippet });
const inline = (name: string, snippet?: string): TwigTagSpec => ({ ...core, name, form: "inline", snippet });

const openingTags: TwigTagSpec[] = [
  block("apply", "endapply", [], "apply ${1:filter}"),
  block("autoescape", "endautoescape", [], "autoescape ${1:'html'}"),
  block("block", "endblock", [], "block ${1:name}"),
  { ...block("cache", "endcache", [], "cache ${1:key}"), source: "twig-extra" },
  block("embed", "endembed", [], "embed '${1:template.html.twig}'"),
  block("for", "endfor", ["else"], "for ${1:item} in ${2:items}"),
  { ...block("guard", "endguard", ["else"], "guard ${1:function} ${2:name}"), since: "3.15" },
  block("if", "endif", ["elseif", "else"], "if ${1:condition}"),
  block("macro", "endmacro", [], "macro ${1:name}(${2:args})"),
  block("sandbox", "endsandbox"),
  { ...block("set", "endset", [], "set ${1:name}"), form: "conditional-block" },
  block("verbatim", "endverbatim"),
  block("with", "endwith", [], "with ${1:context}"),
  { ...block("filter", "endfilter"), source: "twig-legacy", removed: "3.0" },
  { ...block("spaceless", "endspaceless"), source: "twig-legacy", removed: "3.0" }
];

const inlineTags: TwigTagSpec[] = [
  inline("deprecated"), inline("do", "do ${1:expression}"), inline("extends", "extends '${1:base.html.twig}'"),
  inline("flush"), inline("from", "from '${1:macros.html.twig}' import ${2:macro}"),
  inline("import", "import '${1:macros.html.twig}' as ${2:macros}"),
  inline("include", "include '${1:template.html.twig}'"), { ...inline("types", "types {${1:name}: '${2:type}'}"), since: "3.13" },
  inline("use", "use '${1:blocks.html.twig}'")
];

const branchTags: TwigTagSpec[] = [
  { ...core, name: "elseif", form: "branch", opens: "if", snippet: "elseif ${1:condition}" },
  { ...core, name: "else", form: "branch", opens: "if" },
  { source: "twig-legacy", name: "empty", form: "branch", opens: "for", removed: "3.0" }
];

const closingTags: TwigTagSpec[] = openingTags.map((tag) => ({
  source: tag.source, since: tag.since, removed: tag.removed, deprecated: tag.deprecated,
  name: tag.closing!, form: "closing", opens: tag.name
}));

const signatures: Record<string, string> = {
  attribute: "attribute(object, attribute, arguments = [])", block: "block(name, template = null)",
  constant: "constant(name, object = null)", cycle: "cycle(values, position)", date: "date(date = null, timezone = null)",
  enum: "enum(class)", enum_cases: "enum_cases(class)", include: "include(template, variables = {}, with_context = true, ignore_missing = false, sandboxed = false)",
  max: "max(values)", min: "min(values)", parent: "parent()", random: "random(values = null, max = null)",
  range: "range(low, high, step = 1)", source: "source(name, ignore_missing = false)",
  date_modify: "date_modify(modifier)", default: "default(default = '')", escape: "escape(strategy = 'html', charset = null, autoescape = false)",
  filter: "filter(arrow)", find: "find(arrow)", format: "format(...values)", join: "join(glue = '', and = null)",
  map: "map(arrow)", reduce: "reduce(arrow, initial = null)", replace: "replace(from)", round: "round(precision = 0, method = 'common')",
  slice: "slice(start, length = null, preserve_keys = false)", sort: "sort(arrow = null)", split: "split(delimiter, limit = null)",
  divisible_by: "divisible by(number)", same_as: "same as(value)"
};

const EXTRA_FILTERS = new Set([
  "country_name", "currency_name", "currency_symbol", "data_uri", "format_currency", "format_date",
  "format_datetime", "format_number", "format_time", "html_attr_merge", "html_attr_type", "html_to_markdown", "inky_to_html", "inline_css", "language_name",
  "locale_name", "markdown_to_html", "plural", "singular", "slug", "timezone_name", "u"
]);
const EXTRA_FUNCTIONS = new Set([
  "country_names", "country_timezones", "currency_names", "html_attr", "html_classes", "html_cva", "language_names",
  "locale_names", "script_names", "template_from_string", "timezone_names"
]);

const callable = (
  kind: TwigCallableKind, name: string, source: TwigSpecSource = "twig-core",
  upstream?: { class: string; signature: string | null; deprecated: boolean; aliases: string[]; alwaysAllowedInSandbox: boolean | null }
): TwigCallableSpec => ({
  source, kind, name, signature: signatures[name.replaceAll(" ", "_")] ?? upstream?.signature ?? undefined,
  since: CALLABLE_SINCE[`${kind}:${name}`],
  upstreamClass: upstream?.class, aliases: upstream?.aliases,
  deprecated: upstream?.deprecated ? "3.x" : undefined,
  documented: !["none", "true"].includes(name),
  alwaysAllowedInSandbox: upstream?.alwaysAllowedInSandbox ?? undefined,
  allowsUndefinedInput: (kind === "test" && name === "defined") || (kind === "filter" && name === "default")
});

const CALLABLE_SINCE: Readonly<Record<string, string>> = {
  "filter:find": "3.11", "filter:shuffle": "3.11", "filter:invoke": "3.19",
  "function:enum_cases": "3.12", "function:enum": "3.15",
  "test:mapping": "3.11", "test:sequence": "3.11"
};

const generatedCallables: TwigCallableSpec[] = (Object.entries(upstreamRuntime.callables) as Array<[
  TwigCallableKind,
  Array<{ name: string; class: string; signature: string | null; deprecated: boolean; aliases: string[]; alwaysAllowedInSandbox: boolean | null }>
]>).flatMap(([kind, entries]) => entries
  .filter((entry) => entry.name !== "format_*_number")
  .map((entry) => callable(kind, entry.name,
    kind === "filter" && EXTRA_FILTERS.has(entry.name) || kind === "function" && EXTRA_FUNCTIONS.has(entry.name) ? "twig-extra" : "twig-core",
    entry)));

interface SymfonyRuntime {
  symfony: { version: string; commit: string };
  callables: Array<{ kind: string; name: string; extension: string; package: string; signature: string | null; deprecated: boolean }>;
  tags: Array<{ name: string; extension: string; package: string }>;
}
const symfonyRuntimes: Readonly<Record<string, SymfonyRuntime>> = {
  "6.4": symfony64Runtime,
  "7.4": symfony74Runtime,
  "8.1": symfony81Runtime
};
const generatedSymfonyCallables = (runtime: SymfonyRuntime): TwigCallableSpec[] => runtime.callables
  .filter((entry, index, entries) => entries.findIndex((current) => current.kind === entry.kind && current.name === entry.name) === index)
  .filter((entry) => !generatedCallables.some((current) => current.kind === entry.kind && current.name === entry.name))
  .map((entry) => ({
    source: "symfony-bridge" as const,
    package: entry.package,
    kind: entry.kind as TwigCallableKind,
    name: entry.name,
    signature: entry.signature ?? undefined,
    deprecated: entry.deprecated ? runtime.symfony.version : undefined,
    upstreamClass: entry.extension
  }));

export function getSymfonyTwigCallables(version = "8.1"): readonly TwigCallableSpec[] {
  const [major = "8", minor = "1"] = version.replace(/^v/, "").split(".");
  const runtime = symfonyRuntimes[`${major}.${minor}`] ?? symfony81Runtime;
  return generatedSymfonyCallables(runtime);
}

export function getSymfonyTwigTags(version = "8.1"): readonly TwigTagSpec[] {
  const [major = "8", minor = "1"] = version.replace(/^v/, "").split(".");
  const runtime = symfonyRuntimes[`${major}.${minor}`] ?? symfony81Runtime;
  return runtime.tags.map((entry) => ({
    source: "symfony-bridge", package: entry.package, name: entry.name, form: "inline",
    upstreamClass: entry.extension
  }));
}

const operators: TwigOperatorSpec[] = [
  ["=", 0, "right", "infix"], ["?", 0, "left", "infix"], ["?:", 5, "right", "infix"],
  ["or", 10, "left", "infix"], ["xor", 12, "left", "infix"], ["and", 15, "left", "infix"],
  ["b-or", 16, "left", "infix"], ["b-xor", 17, "left", "infix"], ["b-and", 18, "left", "infix"],
  ["==", 20, "left", "infix"], ["!=", 20, "left", "infix"], ["===", 20, "left", "infix"], ["!==", 20, "left", "infix"],
  ["<=>", 20, "left", "infix"], ["<", 20, "left", "infix"], [">", 20, "left", "infix"], ["<=", 20, "left", "infix"], [">=", 20, "left", "infix"],
  ["in", 20, "left", "infix"], ["not in", 20, "left", "infix"], ["matches", 20, "left", "infix"],
  ["starts with", 20, "left", "infix"], ["ends with", 20, "left", "infix"], ["has some", 20, "left", "infix"], ["has every", 20, "left", "infix"],
  ["..", 25, "left", "infix"], ["+", 30, "left", "infix"], ["-", 30, "left", "infix"], ["~", 40, "left", "infix"],
  ["not", 50, "right", "prefix"], ["*", 60, "left", "infix"], ["/", 60, "left", "infix"], ["//", 60, "left", "infix"], ["%", 60, "left", "infix"],
  ["is", 100, "left", "infix"], ["is not", 100, "left", "infix"], ["**", 200, "right", "infix"], ["=>", 250, "left", "infix"],
  ["??", 300, "right", "infix"], ["...", 512, "right", "prefix"], [".", 512, "left", "infix"], ["|", 512, "left", "infix"]
].map(([name, precedence, associativity, fixity]) => ({
  ...core, name: String(name), precedence: Number(precedence), associativity: associativity as "left" | "right",
  fixity: fixity as "prefix" | "infix", aliases: name === "." ? ["?."] : name === "?:" ? ["? :"] : undefined,
  allowsUndefinedInput: name === "??",
  since: name === "=" || name === "===" || name === "!==" ? "3.23"
    : name === "has some" || name === "has every" ? "3.5"
    : name === "..." ? "3.7" : undefined
}));

export const TWIG_3_SPEC: TwigLanguageSpec = {
  schemaVersion: 2,
  documentedVersion: "3.28.0",
  upstream: {
    twig: { version: "3.28.0", tag: "v3.28.0", commit: "762a989bf2f1a54939fa7da33065beba4ee46e3d" },
    symfony: { version: "8.1.1", tag: "v8.1.1", commit: "12cba50951f46635e6a692c66aa5d8ed7a189302" }
  },
  tags: [...openingTags, ...inlineTags, ...branchTags, ...closingTags],
  callables: [
    ...generatedCallables, ...generatedSymfonyCallables(symfony81Runtime)
  ],
  operators,
  globals: ["_self", "_context", "_charset"]
};


export function getTwigTag(name: string, version = TWIG_3_SPEC.documentedVersion): TwigTagSpec | undefined {
  return TWIG_3_SPEC.tags.find((tag) => tag.name === name && isAvailableInVersion(tag, version));
}
export function getTwigCallable(kind: TwigCallableKind, name: string, version = TWIG_3_SPEC.documentedVersion): TwigCallableSpec | undefined {
  return TWIG_3_SPEC.callables.find((entry) => entry.kind === kind && entry.name === name && isAvailableInVersion(entry, version));
}
export function getTwigOperator(name: string, version = TWIG_3_SPEC.documentedVersion): TwigOperatorSpec | undefined {
  return TWIG_3_SPEC.operators.find((entry) => (entry.name === name || entry.aliases?.includes(name)) && isAvailableInVersion(entry, version));
}
export function getTwigOpeningTags(): readonly TwigTagSpec[] {
  return selectTwigSpec().tags.filter((tag) => tag.form === "block" || tag.form === "conditional-block");
}
export function isVersionAtLeast(actual: string, required: string): boolean {
  const parse = (value: string) => value.split(".").map((part) => Number(part.replace(/\D.*$/, "")) || 0);
  const left = parse(actual); const right = parse(required);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if ((left[index] ?? 0) !== (right[index] ?? 0)) return (left[index] ?? 0) > (right[index] ?? 0);
  }
  return true;
}

export function selectTwigSpec(version = TWIG_3_SPEC.documentedVersion): TwigLanguageSpec {
  const available = <T extends VersionedTwigFact>(items: readonly T[]) => items.filter((item) => isAvailableInVersion(item, version));
  return { ...TWIG_3_SPEC, documentedVersion: version, tags: available(TWIG_3_SPEC.tags), callables: available(TWIG_3_SPEC.callables), operators: available(TWIG_3_SPEC.operators) };
}

function isAvailableInVersion(item: VersionedTwigFact, version: string): boolean {
  return (!item.since || isVersionAtLeast(version, item.since))
    && (!item.removed || !isVersionAtLeast(version, item.removed));
}
