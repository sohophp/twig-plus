import { describe, expect, it } from "vitest";

import {
  getCompletionSortScore,
  getTwigCompletionMatch
} from "../src/language/completionData";

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
