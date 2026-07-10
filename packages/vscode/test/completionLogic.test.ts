import { describe, expect, it } from "vitest";

import {
  FILTER_COMPLETIONS,
  FUNCTION_COMPLETIONS,
  TAG_COMPLETIONS
} from "../src/language/completionData";
import {
  matchesCompletionQuery,
  sortCompletionEntries
} from "../src/language/completionLogic";

describe("matchesCompletionQuery", () => {
  it("matches contains queries so twig suggestions feel less strict", () => {
    expect(matchesCompletionQuery("include", "clu")).toBe(true);
    expect(matchesCompletionQuery("is_granted", "grant")).toBe(true);
    expect(matchesCompletionQuery("default", "json")).toBe(false);
  });
});

describe("sortCompletionEntries", () => {
  it("keeps twig tag ordering aligned with semantic priority", () => {
    const labels = sortCompletionEntries(
      TAG_COMPLETIONS.filter((entry) => matchesCompletionQuery(entry.label, "i")),
      "i"
    )
      .slice(0, 3)
      .map((entry) => entry.label);

    expect(labels).toEqual(["if", "include", "import"]);
  });

  it("prefers function prefix matches before contains matches", () => {
    const labels = sortCompletionEntries(
      FUNCTION_COMPLETIONS.filter((entry) => matchesCompletionQuery(entry.label, "gr")),
      "gr"
    ).map((entry) => entry.label);

    expect(labels).toEqual(["is_granted"]);
  });

  it("sorts filters by exact, prefix, then contains matches", () => {
    const labels = sortCompletionEntries(
      FILTER_COMPLETIONS.filter((entry) => matchesCompletionQuery(entry.label, "up")),
      "up"
    ).map((entry) => entry.label);

    expect(labels[0]).toBe("upper");
  });
});
