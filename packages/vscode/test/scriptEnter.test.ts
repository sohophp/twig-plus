import { describe, expect, it } from "vitest";
import { computeScriptEnterEdit, shouldInsertJavaScriptBracePair } from "../src/editing/scriptEnter";

describe("computeScriptEnterEdit", () => {
  it("closes an arrow function body before the existing call parenthesis", () => {
    const source = "<script>\n    document.addEventListener('DOMContentLoaded',()=>{)\n</script>";
    const offset = source.indexOf(")\n</script>");
    const result = computeScriptEnterEdit(source, [{ anchor: offset, active: offset }], { eol: "\n", indentUnit: "    " });
    expect(result?.edits[0].newText).toBe("\n        \n    }");
    expect(result?.selections[0].active).toBe(offset + 9);
  });

  it("does not run outside script and expands an existing native brace pair", () => {
    const outside = "<style>#h3{</style>";
    const outsideOffset = outside.indexOf("</style>");
    expect(computeScriptEnterEdit(outside, [{ anchor: outsideOffset, active: outsideOffset }], { eol: "\n", indentUnit: "  " })).toBeNull();
    const paired = "<script>if (ok) {}</script>";
    const pairedOffset = paired.indexOf("}");
    expect(computeScriptEnterEdit(paired, [{ anchor: pairedOffset, active: pairedOffset }], { eol: "\n", indentUnit: "  " })?.edits[0].newText)
      .toBe("\n  \n");
  });

  it("pairs braces only in safe code inside a real script element", () => {
    const script = "<script>const ready = ()=></script>";
    expect(shouldInsertJavaScriptBracePair(script, script.indexOf("</script>"))).toBe(true);
    const string = "<script>const value = '=>'</script>";
    expect(shouldInsertJavaScriptBracePair(string, string.indexOf("</script>"))).toBe(false);
    const plainBlock = "{% block scriptForLayout %}const ready = ()=>{% endblock %}";
    expect(shouldInsertJavaScriptBracePair(plainBlock, plainBlock.indexOf("{% endblock"))).toBe(false);
  });

});
