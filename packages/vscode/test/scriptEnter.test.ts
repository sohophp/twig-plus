import { describe, expect, it } from "vitest";
import { computeScriptBracePairDelete, computeScriptBracePairEdit, computeScriptEnterEdit } from "../src/editing/scriptEnter";

describe("computeScriptEnterEdit", () => {
  it("inserts an immediate brace pair in JavaScript code", () => {
    const source = "<script>document.addEventListener(\"DOMContentLoaded\",()=>)</script>";
    const offset = source.indexOf(")</script>");
    const result = computeScriptBracePairEdit(source, [{ anchor: offset, active: offset }]);
    expect(result?.edits[0].newText).toBe("{}");
    expect(result?.selections[0].active).toBe(offset + 1);
  });

  it("does not pair braces in JavaScript strings, comments, or Twig output", () => {
    for (const sourceWithCursor of [
      '<script>const value = "|";</script>',
      "<script>// |\n</script>",
      "<script>{{ | }}</script>"
    ]) {
      const offset = sourceWithCursor.indexOf("|");
      const source = sourceWithCursor.replace("|", "");
      expect(computeScriptBracePairEdit(source, [{ anchor: offset, active: offset }])).toBeNull();
    }
  });

  it("deletes both sides of an empty JavaScript brace pair", () => {
    const source = '<script>document.addEventListener("DOMContentLoaded",()=>{})</script>';
    const offset = source.indexOf("})</script>");
    const result = computeScriptBracePairDelete(source, [{ anchor: offset, active: offset }]);
    expect(result?.edits[0]).toEqual({ start: offset - 1, end: offset + 1, newText: "" });
    expect(result?.selections[0].active).toBe(offset - 1);
  });

  it("does not pair-delete nonempty, string, or Twig braces", () => {
    for (const sourceWithCursor of [
      "<script>{x|}</script>",
      '<script>const value = "{|}";</script>',
      "<script>{{ {|} }}</script>"
    ]) {
      const offset = sourceWithCursor.indexOf("|");
      const source = sourceWithCursor.replace("|", "");
      expect(computeScriptBracePairDelete(source, [{ anchor: offset, active: offset }])).toBeNull();
    }
  });

  it("closes an arrow function body before the existing call parenthesis", () => {
    const source = "<script>\n    document.addEventListener('DOMContentLoaded',()=>{)\n</script>";
    const offset = source.indexOf(")\n</script>");
    const result = computeScriptEnterEdit(source, [{ anchor: offset, active: offset }], { eol: "\n", indentUnit: "    " });
    expect(result?.edits[0].newText).toBe("\n        \n    }");
    expect(result?.selections[0].active).toBe(offset + 9);
  });

  it("does not run outside script or duplicate an existing brace", () => {
    const outside = "<style>#h3{</style>";
    const outsideOffset = outside.indexOf("</style>");
    expect(computeScriptEnterEdit(outside, [{ anchor: outsideOffset, active: outsideOffset }], { eol: "\n", indentUnit: "  " })).toBeNull();
    const paired = "<script>if (ok) {}</script>";
    const pairedOffset = paired.indexOf("}");
    expect(computeScriptEnterEdit(paired, [{ anchor: pairedOffset, active: pairedOffset }], { eol: "\n", indentUnit: "  " })).toBeNull();
  });
});
