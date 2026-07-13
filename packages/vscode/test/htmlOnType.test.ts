import { describe, expect, it } from "vitest";
import { computeHtmlOnTypeEdit } from "../src/editing/htmlOnTypeLogic";

describe("HTML on-type closing", () => {
  it.each(["div", "span", "script", "my-element"])("closes %s after >", (name) => {
    const source = `<${name}>`;
    expect(computeHtmlOnTypeEdit(source, source.length)).toEqual({ start: source.length, end: source.length, newText: `</${name}>` });
  });

  it("uses the Hybrid HTML node for Twig and greater-than attributes", () => {
    const source = `<div title=\"a > b\" class=\"{{ kind }}\">`;
    expect(computeHtmlOnTypeEdit(source, source.length)?.newText).toBe("</div>");
  });

  it.each(["<br>", "<input>", "<div/>", "{% verbatim %}<div>"])("does not close unsafe source %s", (source) => {
    expect(computeHtmlOnTypeEdit(source, source.length)).toBeNull();
  });

  it("does not duplicate an existing pair", () => {
    const source = "<div></div>";
    expect(computeHtmlOnTypeEdit(source, "<div>".length)).toBeNull();
  });
});
