export type TwigCompletionKind = "tag" | "filter" | "function" | null;

export interface TwigCompletionMatch {
  kind: TwigCompletionKind;
  prefix: string;
}

export interface StaticCompletionEntry {
  label: string;
  detail: string;
  documentation: string;
  insertText?: string;
}

export const TAG_COMPLETIONS: StaticCompletionEntry[] = [
  {
    label: "if",
    detail: "Twig tag",
    documentation: "Insert an if / endif block.",
    insertText: "if ${1:condition} %}\n  $0\n{% endif"
  },
  {
    label: "for",
    detail: "Twig tag",
    documentation: "Insert a for / endfor block.",
    insertText: "for ${1:item} in ${2:items} %}\n  $0\n{% endfor"
  },
  {
    label: "block",
    detail: "Twig tag",
    documentation: "Insert a block / endblock pair.",
    insertText: "block ${1:name} %}\n  $0\n{% endblock"
  },
  {
    label: "include",
    detail: "Twig tag",
    documentation: "Insert an include tag.",
    insertText: "include '${1:template.html.twig}'"
  },
  {
    label: "extends",
    detail: "Twig tag",
    documentation: "Insert an extends tag.",
    insertText: "extends '${1:base.html.twig}'"
  },
  {
    label: "embed",
    detail: "Twig tag",
    documentation: "Insert an embed / endembed block.",
    insertText: "embed '${1:template.html.twig}' %}\n  $0\n{% endembed"
  },
  {
    label: "set",
    detail: "Twig tag",
    documentation: "Insert a set tag.",
    insertText: "set ${1:name} = ${2:value}"
  },
  {
    label: "macro",
    detail: "Twig tag",
    documentation: "Insert a macro / endmacro block.",
    insertText: "macro ${1:name}(${2:args}) %}\n  $0\n{% endmacro"
  },
  {
    label: "with",
    detail: "Twig tag",
    documentation: "Insert a with / endwith block.",
    insertText: "with ${1:context} %}\n  $0\n{% endwith"
  },
  {
    label: "apply",
    detail: "Twig tag",
    documentation: "Insert an apply / endapply block.",
    insertText: "apply ${1:filter} %}\n  $0\n{% endapply"
  },
  {
    label: "import",
    detail: "Twig tag",
    documentation: "Insert an import tag.",
    insertText: "import '${1:macros.html.twig}' as ${2:macros}"
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
      prefix: filterMatch[1].toLowerCase()
    };
  }

  const tagMatch = linePrefix.match(/\{%\s*([a-zA-Z_]*)$/);
  if (tagMatch) {
    return {
      kind: "tag",
      prefix: tagMatch[1].toLowerCase()
    };
  }

  const functionMatch = linePrefix.match(/\{\{[\s\S]*?\b([a-zA-Z_][a-zA-Z0-9_]*)$/);
  if (functionMatch && !linePrefix.trimEnd().endsWith("|")) {
    return {
      kind: "function",
      prefix: functionMatch[1].toLowerCase()
    };
  }

  return {
    kind: null,
    prefix: ""
  };
}
