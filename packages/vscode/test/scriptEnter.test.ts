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

  it("does not run outside script or duplicate an existing brace", () => {
    const outside = "<style>#h3{</style>";
    const outsideOffset = outside.indexOf("</style>");
    expect(computeScriptEnterEdit(outside, [{ anchor: outsideOffset, active: outsideOffset }], { eol: "\n", indentUnit: "  " })).toBeNull();
    const paired = "<script>if (ok) {}</script>";
    const pairedOffset = paired.indexOf("}");
    expect(computeScriptEnterEdit(paired, [{ anchor: pairedOffset, active: pairedOffset }], { eol: "\n", indentUnit: "  " })?.edits[0].newText)
      .toBe("\n  \n");
  });

  it("recognizes JavaScript-only Twig blocks and expands a native brace pair", () => {
    const source = "{% block scriptForLayout %}\n  document.addEventListener('DOMContentLoaded',()=>{})\n{% endblock %}";
    const offset = source.indexOf("}", source.indexOf("=>{"));
    const result = computeScriptEnterEdit(source, [{ anchor: offset, active: offset }], { eol: "\n", indentUnit: "  " });
    expect(result?.edits[0].newText).toBe("\n    \n  ");
    expect(result?.selections[0].active).toBe(offset + 5);
  });

  it("does not treat unrelated Twig blocks as JavaScript", () => {
    const source = "{% block description %}\n  example({})\n{% endblock %}";
    const offset = source.indexOf("}");
    expect(computeScriptEnterEdit(source, [{ anchor: offset, active: offset }], { eol: "\n", indentUnit: "  " })).toBeNull();
  });

  it("only inserts a brace pair in provable JavaScript block contexts", () => {
    const arrow = "{% block scriptForLayout %}\n  const ready = ()=>\n{% endblock %}";
    expect(shouldInsertJavaScriptBracePair(arrow, arrow.indexOf("\n{% endblock"))).toBe(true);
    const string = "{% block scriptForLayout %}\n  const value = '=>'\n{% endblock %}";
    expect(shouldInsertJavaScriptBracePair(string, string.indexOf("\n{% endblock"))).toBe(false);
    const comment = "{% block scriptForLayout %}\n  // callback =>\n{% endblock %}";
    expect(shouldInsertJavaScriptBracePair(comment, comment.indexOf("\n{% endblock"))).toBe(false);
    const regex = "{% block scriptForLayout %}\n  const pattern = /=>\n{% endblock %}";
    expect(shouldInsertJavaScriptBracePair(regex, regex.indexOf("\n{% endblock"))).toBe(false);
    const twig = "{% block body %}\n  const ready = ()=>\n{% endblock %}";
    expect(shouldInsertJavaScriptBracePair(twig, twig.indexOf("\n{% endblock"))).toBe(false);
  });
});
