import { describe, expect, it } from "vitest";
import { parseHybridDocument } from "@twig-plus/parser";
import { getTwigStructuralQuickFixes } from "../src/twigCodeActions";

describe("Twig structural quick fixes", () => {
  it("closes every unclosed tag atomically in reverse stack order", () => {
    const source = `{% if user %}\n  {% for item in items %}\n    {{ item }}`;
    const fixes = getTwigStructuralQuickFixes(parseHybridDocument(source), [{
      code: "unclosed-tag",
      message: `Unclosed Twig tag "for".`,
      range: { start: source.indexOf("{% for"), end: source.indexOf("{% for") + 23 }
    }]);
    expect(fixes).toEqual([expect.objectContaining({
      title: "Insert all missing Twig closing tags",
      preferred: true,
      edits: [{
        range: { start: source.length, end: source.length },
        newText: `\n  {% endfor %}\n{% endif %}`
      }]
    })]);
  });

  it("offers an exact single closing tag insertion", () => {
    const source = `{% block body %}\ncontent\n`;
    const fixes = getTwigStructuralQuickFixes(parseHybridDocument(source), [{
      code: "unclosed-tag", message: `Unclosed Twig tag "block".`, range: { start: 0, end: 16 }
    }]);
    expect(fixes[0]).toMatchObject({
      title: "Insert {% endblock %}",
      edits: [{ range: { start: source.length, end: source.length }, newText: "{% endblock %}" }]
    });
  });

  it("removes only explicit unexpected tags and empty outputs", () => {
    const source = `{% endif %}\n<p>{{   }}</p>`;
    const closingStart = source.indexOf("{% endif %}");
    const emptyStart = source.indexOf("{{");
    const fixes = getTwigStructuralQuickFixes(parseHybridDocument(source), [
      {
        code: "unexpected-closing-tag", message: `Unexpected closing Twig tag "endif".`,
        range: { start: closingStart, end: closingStart + "{% endif %}".length }
      },
      {
        code: "empty-output", message: "Empty Twig output block.",
        range: { start: emptyStart, end: emptyStart + "{{   }}".length }
      }
    ]);
    expect(fixes).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: "Remove {% endif %}", edits: [{ range: { start: 0, end: 11 }, newText: "" }] }),
      expect.objectContaining({ title: "Remove empty Twig output", preferred: true })
    ]));
  });

  it("does not invent actions for semantic or project diagnostics", () => {
    const source = `{{ missing }}`;
    expect(getTwigStructuralQuickFixes(parseHybridDocument(source), [{
      code: "unresolved-name", message: "Unresolved variable 'missing'.", range: { start: 3, end: 10 }
    }])).toEqual([]);
  });
});
