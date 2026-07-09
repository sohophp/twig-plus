import { describe, expect, it } from "vitest";

import { getTwigCompletionMatch } from "../src/language/completionData";

describe("getTwigCompletionMatch", () => {
  it("detects tag completions inside twig tags", () => {
    expect(getTwigCompletionMatch("{% inc")).toEqual({
      kind: "tag",
      prefix: "inc"
    });
  });

  it("detects filter completions after a pipe", () => {
    expect(getTwigCompletionMatch("{{ name|upp")).toEqual({
      kind: "filter",
      prefix: "upp"
    });
  });

  it("detects function completions in twig output blocks", () => {
    expect(getTwigCompletionMatch("{{ pat")).toEqual({
      kind: "function",
      prefix: "pat"
    });
  });

  it("returns null when not in a twig completion context", () => {
    expect(getTwigCompletionMatch("<div class=\"hero\">")).toEqual({
      kind: null,
      prefix: ""
    });
  });
});
