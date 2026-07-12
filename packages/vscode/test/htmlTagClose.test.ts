import { describe, expect, it } from "vitest";
import { computeHtmlEnterEdit, computeHtmlTagCloseEdit } from "../src/editing/htmlTagClose";

describe("computeHtmlTagCloseEdit", () => {
  it("closes normal, script, style and custom elements", () => {
    for (const tag of ["div", "script", "style", "my-card"]) {
      const source = `<${tag}`;
      const result = computeHtmlTagCloseEdit(source, [{ anchor: source.length, active: source.length }]);
      expect(result?.edits[0].newText).toBe(`></${tag}>`);
      expect(result?.selections[0].active).toBe(source.length + 1);
    }
  });

  it("closes an opening element when Enter is pressed after it", () => {
    const source = "    <div>";
    const result = computeHtmlEnterEdit(source, [{ anchor: source.length, active: source.length }], {
      eol: "\n", indentUnit: "    "
    });
    expect(result?.edits[0].newText).toBe("\n        \n    </div>");
    expect(result?.selections[0].active).toBe(source.length + 9);
  });

  it("does not duplicate an existing HTML closing tag on Enter", () => {
    const source = "<div>\n</div>";
    expect(computeHtmlEnterEdit(source, [{ anchor: 5, active: 5 }], { eol: "\n", indentUnit: "  " })).toBeNull();
  });

  it("does not close void, self-closing, quoted or already closed elements", () => {
    for (const source of ["<br", "<img src=x /", "<div title=\"open", "<div</div>"]) {
      const offset = source.includes("</div>") ? source.indexOf("</div>") : source.length;
      expect(computeHtmlTagCloseEdit(source, [{ anchor: offset, active: offset }])).toBeNull();
    }
  });
});
