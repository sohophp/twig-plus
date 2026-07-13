import { describe, expect, it } from "vitest";
import { getHtmlCompletions } from "../src/language/htmlCompletionLogic";

function labels(sourceWithCursor: string): string[] {
  const offset = sourceWithCursor.indexOf("|");
  const source = sourceWithCursor.replace("|", "");
  return getHtmlCompletions(source, offset).map((item) => String(item.label));
}

describe("HTML completions in Twig documents", () => {
  it("offers script attributes after a Twig attribute branch", () => {
    expect(labels(`<script {% if module %} t|`)).toContain("type");
  });

  it("offers standard script type values", () => {
    const values = labels(`<script type="|">`);
    expect(values).toContain("module");
    expect(values).toContain("text/javascript");
  });

  it.each([
    [`<input type="|">`, "checkbox"],
    [`<form method="|">`, "post"],
    [`<button type="|">`, "submit"],
    [`<link rel="|">`, "stylesheet"]
  ])("offers a standard value for %s", (source, expected) => {
    expect(labels(source)).toContain(expected);
  });

  it("offers global and ARIA attributes", () => {
    const values = labels(`<div ari|`);
    expect(values).toContain("aria-label");
  });

  it("offers anchor target and standard browsing-context values", () => {
    expect(labels(`<a tar|`)).toContain("target");
    const values = labels(`<a target="|">`);
    expect(values).toEqual(expect.arrayContaining(["_blank", "_self", "_parent", "_top"]));
  });

  it("does not offer HTML completions in script bodies", () => {
    expect(labels(`<script>const t| = 1;</script>`)).toEqual([]);
  });

  it("offers the matching closing tag after a slash", () => {
    expect(labels(`<script></|`)).toContain("script");
  });
});
