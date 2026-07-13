import { describe, expect, it } from "vitest";
import { computeHtmlEnterEdit } from "../src/editing/htmlTagClose";

describe("computeHtmlTagCloseEdit", () => {
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

});
