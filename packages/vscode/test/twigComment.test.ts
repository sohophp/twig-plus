import { describe, expect, it } from "vitest";

import { unwrapTwigComment, wrapTwigComment } from "../src/editing/twigCommentLogic";

describe("Twig line comments", () => {
  it("unwraps independently commented HTML and preserves indentation", () => {
    expect(unwrapTwigComment('{# <style id="rootStyle"> #}')).toBe('<style id="rootStyle">');
    expect(unwrapTwigComment("            {# --fontSize: {{ fontSize }}; #}")).toBe(
      "            --fontSize: {{ fontSize }};"
    );
    expect(unwrapTwigComment("    {#- trimmed -#}")).toBe("    trimmed");
  });

  it("wraps a line once and does not create nested Twig comments", () => {
    expect(wrapTwigComment("    :root {")).toBe("    {# :root { #}");
    expect(wrapTwigComment("    {# :root { #}")).toBe("    {# :root { #}");
  });
});
