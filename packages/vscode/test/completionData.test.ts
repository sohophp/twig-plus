import { describe, expect, it } from "vitest";

import {
  getCompletionSortScore,
  getTwigCompletionMatch,
  TAG_COMPLETIONS,
  FILTER_COMPLETIONS,
  FUNCTION_COMPLETIONS
} from "../src/language/completionData";
import { getTwigCompletionContext } from "@twig-plus/parser";

describe("getTwigCompletionMatch", () => {
  it("detects tag completions inside twig tags", () => {
    expect(getTwigCompletionMatch("{% inc")).toEqual({
      kind: "tag",
      prefix: "inc",
      replaceStartOffset: 3,
      preferClosing: false
    });
  });

  it("detects explicit closing-tag intent from an end-prefix", () => {
    expect(getTwigCompletionMatch("{% endb")).toEqual({
      kind: "tag",
      prefix: "endb",
      replaceStartOffset: 3,
      preferClosing: true
    });
  });

  it("still understands slash-prefixed closing intent for compatibility", () => {
    expect(getTwigCompletionMatch("{% /bl")).toEqual({
      kind: "tag",
      prefix: "bl",
      replaceStartOffset: 3,
      preferClosing: true
    });
  });

  it("detects filter completions after a pipe", () => {
    expect(getTwigCompletionMatch("{{ name|upp")).toEqual({
      kind: "filter",
      prefix: "upp",
      replaceStartOffset: 8,
      preferClosing: false
    });
  });

  it("detects function completions in twig output blocks", () => {
    expect(getTwigCompletionMatch("{{ pat")).toEqual({
      kind: "function",
      prefix: "pat",
      replaceStartOffset: 3,
      preferClosing: false
    });
  });

  it("does not offer function or tag completions inside twig hash keys", () => {
    expect(getTwigCompletionMatch(`{{ item.value|replace({b`)).toEqual({
      kind: null,
      prefix: "",
      replaceStartOffset: 24,
      preferClosing: false
    });
  });

  it("does not offer function completions inside twig strings", () => {
    expect(getTwigCompletionMatch(`{{ path('b`)).toEqual({
      kind: null,
      prefix: "",
      replaceStartOffset: 10,
      preferClosing: false
    });
  });

  it("does not treat twig output identifiers as tag completions", () => {
    expect(getTwigCompletionMatch(`{{ b`)).toEqual({
      kind: "function",
      prefix: "b",
      replaceStartOffset: 3,
      preferClosing: false
    });
  });

  it("returns null when not in a twig completion context", () => {
    expect(getTwigCompletionMatch("<div class=\"hero\">")).toEqual({
      kind: null,
      prefix: "",
      replaceStartOffset: 18,
      preferClosing: false
    });
  });
});

describe("getCompletionSortScore", () => {
  it("prefers exact matches over prefix and contains matches", () => {
    const exact = getCompletionSortScore("if", "if", 100);
    const prefix = getCompletionSortScore("include", "i", 90);
    const contains = getCompletionSortScore("with", "i", 70);

    expect(exact < prefix).toBe(true);
    expect(prefix < contains).toBe(true);
  });

  it("uses semantic priority to break ties between similar matches", () => {
    const include = getCompletionSortScore("include", "i", 90);
    const importTag = getCompletionSortScore("import", "i", 65);

    expect(include < importTag).toBe(true);
  });

  it("keeps exact end-tag matches ahead of broader end-tag candidates", () => {
    const endif = getCompletionSortScore("endif", "endif", 120);
    const endfor = getCompletionSortScore("endfor", "end", 120);

    expect(endif < endfor).toBe(true);
  });
});

describe("static completion coverage", () => {
  it("includes the core twig template-reference tags", () => {
    const labels = TAG_COMPLETIONS.map((entry) => entry.label);

    expect(labels).toEqual(
      expect.arrayContaining([
        "include",
        "extends",
        "embed",
        "import",
        "from"
      ])
    );
  });

  it("includes commonly used twig filters and functions", () => {
    expect(FILTER_COMPLETIONS.map((entry) => entry.label)).toEqual(
      expect.arrayContaining(["escape", "raw", "date", "default", "json_encode"])
    );
    expect(FUNCTION_COMPLETIONS.map((entry) => entry.label)).toEqual(
      expect.arrayContaining(["path", "url", "asset", "include", "source"])
    );
  });
});

describe("getTwigCompletionContext", () => {
  it("offers if middle tags until else has been used", () => {
    const beforeElse = "{% if user %}\n  {{ user.name }}\n";
    const afterElse = "{% if user %}\n{% else %}\n";

    expect(getTwigCompletionContext(beforeElse, beforeElse.length).allowedMiddleTags).toEqual([
      "else",
      "elseif"
    ]);
    expect(getTwigCompletionContext(afterElse, afterElse.length).allowedMiddleTags).toEqual([]);
  });

  it("offers for middle tags and prefers the matching closing tag", () => {
    const source = "{% for item in items %}\n  {{ item.name }}\n";
    const context = getTwigCompletionContext(source, source.length);

    expect(context.allowedMiddleTags).toEqual(["else", "empty"]);
    expect(context.preferredClosingTags).toEqual(["endfor"]);
  });

  it("prefers nested closing tags from innermost to outermost", () => {
    const source = "{% block content %}\n{% if user %}\n";

    expect(
      getTwigCompletionContext(source, source.length).preferredClosingTags
    ).toEqual(["endif", "endblock"]);
  });
});
