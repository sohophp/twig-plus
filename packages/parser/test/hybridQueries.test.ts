import { describe, expect, it } from "vitest";
import {
  collectHybridBlockSymbols,
  collectHybridMacroImports,
  collectHybridStructureSymbols,
  collectHybridUnclosedTwigControlTags,
  getHybridBlockReferenceAtOffset,
  getHybridCompletionContext,
  getHybridExtendsTemplateReference,
  getHybridMacroReferenceAtOffset,
  parseHybridDocument
} from "../src/hybridAst";

describe("pure Hybrid queries", () => {
  it("collects structure symbols and resolves block references", () => {
    const source = [
      "{% block hero %}",
      "  {% macro card(title) %}{{ title }}{% endmacro %}",
      "  {% set teaser %}text{% endset %}",
      "{% endblock %}"
    ].join("\n");
    const document = parseHybridDocument(source);
    expect(collectHybridBlockSymbols(document).map((symbol) => symbol.name)).toEqual(["hero"]);
    expect(collectHybridStructureSymbols(document).map((symbol) => `${symbol.kind}:${symbol.name}`)).toEqual([
      "block:hero", "macro:card", "set:teaser"
    ]);
    expect(getHybridBlockReferenceAtOffset(document, source.indexOf("hero") + 1)).toMatchObject({ name: "hero" });
  });

  it("resolves extends, imports, imported calls, and self calls", () => {
    const source = [
      "{% extends 'base.html.twig' %}",
      "{% import 'macros/forms.twig' as forms %}",
      "{% from 'macros/forms.twig' import input, textarea as area %}",
      "{{ forms.input(user.email) }} {{ input(user.email) }} {{ _self.card(user.email) }}"
    ].join("\n");
    const document = parseHybridDocument(source);
    expect(getHybridExtendsTemplateReference(document)).toBe("base.html.twig");
    expect(collectHybridMacroImports(document)).toEqual([
      { kind: "import", template: "macros/forms.twig", exportedName: "*", localName: "forms", alias: "forms" },
      { kind: "from", template: "macros/forms.twig", exportedName: "input", localName: "input", alias: null },
      { kind: "from", template: "macros/forms.twig", exportedName: "textarea", localName: "area", alias: null }
    ]);
    expect(getHybridMacroReferenceAtOffset(document, source.indexOf("forms.input") + 7)).toEqual({ alias: "forms", kind: "import", name: "input" });
    expect(getHybridMacroReferenceAtOffset(document, source.lastIndexOf("input(user") + 2)).toEqual({ alias: null, kind: "from", name: "input" });
    expect(getHybridMacroReferenceAtOffset(document, source.indexOf("_self.card") + 7)).toEqual({ alias: "_self", kind: "self", name: "card" });
  });

  it("uses the Hybrid stack for branch, closing, and verbatim context", () => {
    const source = "{% block body %}\n{% if user %}\n{% else %}\n{% verbatim %}\n";
    const document = parseHybridDocument(source);
    const context = getHybridCompletionContext(document, source.length);
    expect(context.preferredClosingTags).toEqual(["endverbatim", "endif", "endblock"]);
    expect(context.allowedMiddleTags).toEqual([]);
    expect(collectHybridUnclosedTwigControlTags(document, source.length)).toEqual(["block", "if", "verbatim"]);
  });
});
