export type TwigCompletionKind = "tag" | "filter" | "function" | null;

export interface TwigCompletionMatch {
  kind: TwigCompletionKind;
  prefix: string;
  replaceStartOffset: number;
  preferClosing: boolean;
}

export interface StaticCompletionEntry {
  label: string;
  detail: string;
  documentation: string;
  insertText?: string;
  pairedInsertText?: string;
  priority?: number;
}

export const TAG_COMPLETIONS: StaticCompletionEntry[] = [
  {
    label: "if",
    detail: "Twig tag",
    documentation: "Insert an if / endif block.",
    insertText: "if ${1:condition}",
    pairedInsertText: "if ${1:condition} %}\n\t$0\n{% endif",
    priority: 100
  },
  {
    label: "for",
    detail: "Twig tag",
    documentation: "Insert a for / endfor block.",
    insertText: "for ${1:item} in ${2:items}",
    pairedInsertText: "for ${1:item} in ${2:items} %}\n\t$0\n{% endfor",
    priority: 95
  },
  {
    label: "block",
    detail: "Twig tag",
    documentation: "Insert a block / endblock pair.",
    insertText: "block ${1:name}",
    pairedInsertText: "block ${1:name} %}\n\t$0\n{% endblock",
    priority: 95
  },
  {
    label: "else",
    detail: "Twig tag",
    documentation: "Insert an else tag.",
    insertText: "else",
    priority: 92
  },
  {
    label: "elseif",
    detail: "Twig tag",
    documentation: "Insert an elseif tag.",
    insertText: "elseif ${1:condition}",
    priority: 91
  },
  {
    label: "empty",
    detail: "Twig tag",
    documentation: "Insert an empty tag for for/else loops.",
    insertText: "empty",
    priority: 89
  },
  {
    label: "include",
    detail: "Twig tag",
    documentation: "Insert an include tag.",
    insertText: "include '${1:template.html.twig}'",
    priority: 90
  },
  {
    label: "extends",
    detail: "Twig tag",
    documentation: "Insert an extends tag.",
    insertText: "extends '${1:base.html.twig}'",
    priority: 90
  },
  {
    label: "embed",
    detail: "Twig tag",
    documentation: "Insert an embed / endembed block.",
    insertText: "embed '${1:template.html.twig}'",
    pairedInsertText: "embed '${1:template.html.twig}' %}\n\t$0\n{% endembed",
    priority: 85
  },
  {
    label: "set",
    detail: "Twig tag",
    documentation: "Insert a set tag.",
    insertText: "set ${1:name} = ${2:value}",
    priority: 80
  },
  {
    label: "macro",
    detail: "Twig tag",
    documentation: "Insert a macro / endmacro block.",
    insertText: "macro ${1:name}(${2:args})",
    pairedInsertText: "macro ${1:name}(${2:args}) %}\n\t$0\n{% endmacro",
    priority: 75
  },
  {
    label: "with",
    detail: "Twig tag",
    documentation: "Insert a with / endwith block.",
    insertText: "with ${1:context}",
    pairedInsertText: "with ${1:context} %}\n\t$0\n{% endwith",
    priority: 70
  },
  {
    label: "apply",
    detail: "Twig tag",
    documentation: "Insert an apply / endapply block.",
    insertText: "apply ${1:filter}",
    pairedInsertText: "apply ${1:filter} %}\n\t$0\n{% endapply",
    priority: 70
  },
  {
    label: "import",
    detail: "Twig tag",
    documentation: "Insert an import tag.",
    insertText: "import '${1:macros.html.twig}' as ${2:macros}",
    priority: 65
  },
  {
    label: "from",
    detail: "Twig tag",
    documentation: "Insert a from/import tag.",
    insertText: "from '${1:macros.html.twig}' import ${2:macro}",
    priority: 64
  }
];

export const FILTER_COMPLETIONS: StaticCompletionEntry[] = [
  "escape",
  "raw",
  "date",
  "length",
  "default",
  "json_encode",
  "join",
  "split",
  "merge",
  "upper",
  "lower",
  "capitalize",
  "replace",
  "striptags"
].map((label) => ({
  label,
  detail: "Twig filter",
  documentation: `Twig filter \`${label}\`.`
}));

export const FUNCTION_COMPLETIONS: StaticCompletionEntry[] = [
  { label: "path", detail: "Twig function", documentation: "Generate a path.", insertText: "path('${1:route_name}'${2})" },
  { label: "url", detail: "Twig function", documentation: "Generate an absolute URL.", insertText: "url('${1:route_name}'${2})" },
  { label: "asset", detail: "Twig function", documentation: "Generate an asset URL.", insertText: "asset('${1:path}')" },
  { label: "include", detail: "Twig function", documentation: "Render another template.", insertText: "include('${1:template.html.twig}')" },
  { label: "source", detail: "Twig function", documentation: "Return template source.", insertText: "source('${1:template.html.twig}')" },
  { label: "dump", detail: "Twig function", documentation: "Debug dump output.", insertText: "dump(${1:value})" },
  { label: "csrf_token", detail: "Twig function", documentation: "Generate a CSRF token.", insertText: "csrf_token('${1:intention}')" },
  { label: "is_granted", detail: "Twig function", documentation: "Check authorization.", insertText: "is_granted('${1:ROLE_USER}')" }
];

export function getTwigCompletionMatch(linePrefix: string): TwigCompletionMatch {
  const filterMatch = linePrefix.match(/\{\{[\s\S]*\|\s*([a-zA-Z_]*)$/);
  if (filterMatch) {
    return {
      kind: "filter",
      prefix: filterMatch[1].toLowerCase(),
      replaceStartOffset: linePrefix.length - filterMatch[1].length,
      preferClosing: false
    };
  }

  const tagMatch = linePrefix.match(/\{%\s*(\/?)([a-zA-Z_]*)$/);
  if (tagMatch) {
    const rawPrefix = tagMatch[2].toLowerCase();

    return {
      kind: "tag",
      prefix: rawPrefix,
      replaceStartOffset: linePrefix.length - (tagMatch[1].length + tagMatch[2].length),
      preferClosing: tagMatch[1] === "/" || rawPrefix.startsWith("end")
    };
  }

  const functionMatch = linePrefix.match(/\{\{[\s\S]*?\b([a-zA-Z_][a-zA-Z0-9_]*)$/);
  if (
    functionMatch &&
    !linePrefix.trimEnd().endsWith("|") &&
    isFunctionCompletionPosition(linePrefix, functionMatch[1])
  ) {
    return {
      kind: "function",
      prefix: functionMatch[1].toLowerCase(),
      replaceStartOffset: linePrefix.length - functionMatch[1].length,
      preferClosing: false
    };
  }

  return {
    kind: null,
    prefix: "",
    replaceStartOffset: linePrefix.length,
    preferClosing: false
  };
}

function isFunctionCompletionPosition(linePrefix: string, prefix: string): boolean {
  const prefixStart = linePrefix.length - prefix.length;
  const beforePrefix = linePrefix.slice(0, prefixStart);
  if (beforePrefix.trimEnd().endsWith("{{")) {
    return true;
  }

  const previousNonSpace = beforePrefix.match(/\S(?=\s*$)/)?.[0] ?? "";

  if (!previousNonSpace) {
    return true;
  }

  if (previousNonSpace === "{" || previousNonSpace === "." || previousNonSpace === ":") {
    return false;
  }

  return /[\s({[,?:=+\-*/%~]/.test(previousNonSpace);
}

export function getCompletionSortScore(
  label: string,
  query: string,
  priority = 0
): string {
  const normalizedLabel = label.toLowerCase();
  const normalizedQuery = query.toLowerCase();

  let matchBucket = 3;
  if (!normalizedQuery) {
    matchBucket = 0;
  } else if (normalizedLabel === normalizedQuery) {
    matchBucket = 0;
  } else if (normalizedLabel.startsWith(normalizedQuery)) {
    matchBucket = 1;
  } else if (normalizedLabel.includes(normalizedQuery)) {
    matchBucket = 2;
  }

  const invertedPriority = String(999 - priority).padStart(3, "0");
  return `${matchBucket}-${invertedPriority}-${normalizedLabel}`;
}
