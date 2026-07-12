import { describe, expect, it } from "vitest";
import { computeStyleEnterEdit } from "../src/editing/styleEnter";

describe("computeStyleEnterEdit", () => {
  it("closes a CSS rule atomically inside style", () => {
    const source = "<style>\n    #h3{\n</style>";
    const offset = source.indexOf("\n", source.indexOf("#h3"));
    const result = computeStyleEnterEdit(source, [{ anchor: offset, active: offset }], { eol: "\n", indentUnit: "    " });
    expect(result?.edits[0].newText).toBe("\n        \n    }");
    expect(result?.selections[0].active).toBe(offset + 9);
  });

  it("does not run outside style", () => {
    const source = "<script>if (ok) {</script>";
    const offset = source.indexOf("</script>");
    expect(computeStyleEnterEdit(source, [{ anchor: offset, active: offset }], { eol: "\n", indentUnit: "  " })).toBeNull();
  });

  it("does not duplicate a matching brace that already exists later in style", () => {
    const source = "<style>\n    .b {\n        color: red;\n    }\n</style>";
    const offset = source.indexOf("\n", source.indexOf(".b"));
    expect(computeStyleEnterEdit(source, [{ anchor: offset, active: offset }], { eol: "\n", indentUnit: "    " })).toBeNull();
  });

  it("ignores braces in CSS strings and comments when finding the matching close", () => {
    const source = '<style>\n.x {\n content: "}"; /* } */\n</style>';
    const offset = source.indexOf("\n", source.indexOf(".x"));
    expect(computeStyleEnterEdit(source, [{ anchor: offset, active: offset }], { eol: "\n", indentUnit: "  " })?.edits[0].newText)
      .toBe("\n  \n}");
  });
});
