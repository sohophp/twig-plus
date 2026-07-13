import { describe, expect, it } from "vitest";
import { computeTwigEnterEdit } from "../src/editing/twigEnter";

const options = { eol: "\n" as const, indentUnit: "    " };

describe("computeTwigEnterEdit", () => {
  it.each([
    ["block", "endblock"], ["if", "endif"], ["for", "endfor"], ["macro", "endmacro"],
    ["cache", "endcache"], ["verbatim", "endverbatim"]
  ])("closes %s in one edit", (opening, closing) => {
    const source = `{% ${opening} value %}`;
    const result = computeTwigEnterEdit(source, [{ anchor: source.length, active: source.length }], options);
    expect(result).toEqual({
      edits: [{ start: source.length, end: source.length, newText: `\n    \n{% ${closing} %}` }],
      selections: [{ anchor: source.length + 5, active: source.length + 5 }]
    });
  });

  it("preserves CRLF, tabs, and base indentation", () => {
    const source = "\t{% block value %}";
    const result = computeTwigEnterEdit(source, [{ anchor: source.length, active: source.length }], { eol: "\r\n", indentUnit: "\t" });
    expect(result?.edits[0].newText).toBe("\r\n\t\t\r\n\t{% endblock %}");
  });

  it("does not duplicate an existing closing tag", () => {
    const source = "{% block value %}\n{% endblock %}";
    expect(computeTwigEnterEdit(source, [{ anchor: 17, active: 17 }], options)).toBeNull();
  });

  it("rejects inline, incomplete, selected, and mixed multi-cursor input", () => {
    expect(computeTwigEnterEdit("<p>{% block x %}</p>", [{ anchor: 16, active: 16 }], options)).toBeNull();
    expect(computeTwigEnterEdit("{% block x", [{ anchor: 10, active: 10 }], options)).toBeNull();
    expect(computeTwigEnterEdit("{% block x %}", [{ anchor: 0, active: 13 }], options)).toBeNull();
    const mixed = "{% block x %}\n{% if y %}";
    expect(computeTwigEnterEdit(mixed, [{ anchor: 13, active: 13 }, { anchor: mixed.length, active: mixed.length }], options)).toBeNull();
  });

  it("handles matching multi-cursors atomically", () => {
    const source = "{% block a %}\n{% block b %}";
    const first = source.indexOf("%}") + 2;
    const result = computeTwigEnterEdit(source, [{ anchor: first, active: first }, { anchor: source.length, active: source.length }], options);
    expect(result?.edits).toHaveLength(2);
    expect(result?.selections).toHaveLength(2);
  });

  it("closes standalone Twig control tags inside script and style", () => {
    for (const tag of ["script", "style"]) {
      const source = `<${tag}>\n{# quotes in earlier Twig must stay masked: " ' #}\n{% if user is defined %}\n</${tag}>`;
      const offset = source.indexOf("%}") + 2;
      expect(computeTwigEnterEdit(source, [{ anchor: offset, active: offset }], options)?.edits[0].newText, tag)
        .toBe("\n    \n{% endif %}");
    }
  });

  it("does not close Twig-looking text in embedded strings or comments", () => {
    for (const source of [
      `<script>\nconst value = "{% if user %}";\n</script>`,
      `<script>\n// {% if user %}\n</script>`,
      `<script>\n/*\n{% if user %}\n*/\n</script>`,
      `<style>\n/*\n{% if user %}\n*/\n</style>`
    ]) {
      const offset = source.indexOf("%}") + 2;
      expect(computeTwigEnterEdit(source, [{ anchor: offset, active: offset }], options)).toBeNull();
    }
  });
});
