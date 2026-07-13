export type TwigSpecSource = "twig-core" | "twig-legacy" | "twig-extra" | "symfony-bridge" | "project";
export type TwigCallableKind = "filter" | "function" | "test";
export type TwigTagForm = "inline" | "block" | "conditional-block" | "branch" | "closing";

export interface VersionedTwigFact {
  since?: string;
  removed?: string;
  deprecated?: string;
  source: TwigSpecSource;
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
  allowsUndefinedInput?: boolean;
}

export interface TwigLanguageSpec {
  schemaVersion: 1;
  documentedVersion: string;
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
  block("cache", "endcache", [], "cache ${1:key}"),
  block("embed", "endembed", [], "embed '${1:template.html.twig}'"),
  block("for", "endfor", ["else", "empty"], "for ${1:item} in ${2:items}"),
  block("guard", "endguard", [], "guard ${1:function}"),
  block("if", "endif", ["elseif", "else"], "if ${1:condition}"),
  block("macro", "endmacro", [], "macro ${1:name}(${2:args})"),
  block("sandbox", "endsandbox"),
  { ...block("set", "endset", [], "set ${1:name}"), form: "conditional-block" },
  block("types", "endtypes"),
  block("verbatim", "endverbatim"),
  block("with", "endwith", [], "with ${1:context}"),
  { ...block("filter", "endfilter"), source: "twig-legacy", removed: "3.0" },
  { ...block("spaceless", "endspaceless"), source: "twig-legacy", removed: "3.0" }
];

const inlineTags: TwigTagSpec[] = [
  inline("deprecated"), inline("do", "do ${1:expression}"), inline("extends", "extends '${1:base.html.twig}'"),
  inline("flush"), inline("from", "from '${1:macros.html.twig}' import ${2:macro}"),
  inline("import", "import '${1:macros.html.twig}' as ${2:macros}"),
  inline("include", "include '${1:template.html.twig}'"), inline("use", "use '${1:blocks.html.twig}'")
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

const coreFilters = [
  "abs", "batch", "capitalize", "column", "convert_encoding", "country_name", "currency_name", "currency_symbol",
  "data_uri", "date", "date_modify", "default", "escape", "e", "filter", "find", "first", "format", "format_currency",
  "format_date", "format_datetime", "format_number", "format_time", "html_to_markdown", "inky_to_html", "inline_css", "invoke",
  "join", "json_encode", "keys", "language_name", "last", "length", "locale_name", "lower", "map", "markdown_to_html",
  "merge", "nl2br", "number_format", "plural", "raw", "reduce", "replace", "reverse", "round", "script_name", "shuffle",
  "singular", "slice", "slug", "sort", "spaceless", "split", "striptags", "timezone_name", "title", "trim", "u", "upper", "url_encode"
];
const coreFunctions = [
  "attribute", "block", "constant", "country_names", "country_timezones", "currency_names", "cycle", "date", "dump", "enum",
  "enum_cases", "html_attr", "html_classes", "html_cva", "include", "language_names", "locale_names", "max", "min", "parent",
  "random", "range", "script_names", "source", "template_from_string", "timezone_names"
];
const coreTests = ["constant", "defined", "divisible by", "empty", "even", "iterable", "mapping", "null", "odd", "same as", "sequence"];
const EXTRA_FILTERS = new Set([
  "convert_encoding", "country_name", "currency_name", "currency_symbol", "data_uri", "format_currency", "format_date",
  "format_datetime", "format_number", "format_time", "html_to_markdown", "inky_to_html", "inline_css", "language_name",
  "locale_name", "markdown_to_html", "plural", "script_name", "singular", "slug", "timezone_name", "u"
]);
const EXTRA_FUNCTIONS = new Set([
  "country_names", "country_timezones", "currency_names", "html_attr", "html_classes", "html_cva", "language_names",
  "locale_names", "script_names", "template_from_string", "timezone_names"
]);

const callable = (kind: TwigCallableKind, name: string, source: TwigSpecSource = "twig-core"): TwigCallableSpec => ({
  source, kind, name, signature: signatures[name.replaceAll(" ", "_")],
  allowsUndefinedInput: (kind === "test" && name === "defined") || (kind === "filter" && name === "default")
});

const operators: TwigOperatorSpec[] = [
  ["or", 1, "left"], ["xor", 2, "left"], ["and", 3, "left"], ["??", 4, "right"], ["?:", 5, "right"],
  ["==", 6, "left"], ["!=", 6, "left"], ["===", 6, "left"], ["!==", 6, "left"], ["<=>", 6, "left"],
  ["<", 6, "left"], [">", 6, "left"], ["<=", 6, "left"], [">=", 6, "left"], ["in", 6, "left"],
  ["not in", 6, "left"], ["matches", 6, "left"], ["starts with", 6, "left"], ["ends with", 6, "left"],
  ["has some", 6, "left"], ["has every", 6, "left"], ["b-or", 7, "left"], ["b-xor", 8, "left"], ["b-and", 9, "left"],
  ["..", 10, "left"], ["+", 11, "left"], ["-", 11, "left"], ["~", 12, "left"], ["*", 13, "left"],
  ["/", 13, "left"], ["//", 13, "left"], ["%", 13, "left"], ["**", 14, "right"], ["=", 0, "right"]
].map(([name, precedence, associativity]) => ({
  ...core, name: String(name), precedence: Number(precedence), associativity: associativity as "left" | "right",
  allowsUndefinedInput: name === "??", since: name === "=" ? "3.23" : undefined
}));

export const TWIG_3_SPEC: TwigLanguageSpec = {
  schemaVersion: 1,
  documentedVersion: "3.26.1",
  tags: [...openingTags, ...inlineTags, ...branchTags, ...closingTags],
  callables: [
    ...coreFilters.map((name) => callable("filter", name, EXTRA_FILTERS.has(name) ? "twig-extra" : "twig-core")),
    ...coreFunctions.map((name) => callable("function", name, EXTRA_FUNCTIONS.has(name) ? "twig-extra" : "twig-core")),
    ...coreTests.map((name) => callable("test", name))
  ],
  operators,
  globals: ["_self", "_context", "_charset"]
};


export function getTwigTag(name: string): TwigTagSpec | undefined {
  return TWIG_3_SPEC.tags.find((tag) => tag.name === name);
}
export function getTwigCallable(kind: TwigCallableKind, name: string): TwigCallableSpec | undefined {
  return TWIG_3_SPEC.callables.find((entry) => entry.kind === kind && entry.name === name);
}
export function getTwigOperator(name: string): TwigOperatorSpec | undefined {
  return TWIG_3_SPEC.operators.find((entry) => entry.name === name);
}
export function getTwigOpeningTags(): readonly TwigTagSpec[] {
  return TWIG_3_SPEC.tags.filter((tag) => tag.form === "block" || tag.form === "conditional-block");
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
  const available = <T extends VersionedTwigFact>(items: readonly T[]) => items.filter((item) =>
    (!item.since || isVersionAtLeast(version, item.since)) && (!item.removed || !isVersionAtLeast(version, item.removed)));
  return { ...TWIG_3_SPEC, documentedVersion: version, tags: available(TWIG_3_SPEC.tags), callables: available(TWIG_3_SPEC.callables), operators: available(TWIG_3_SPEC.operators) };
}
