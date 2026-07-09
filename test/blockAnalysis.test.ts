import { describe, expect, it } from "vitest";

import {
  collectTwigBlockSymbols,
  getBlockReferenceAtOffset,
  getExtendsTemplateReference
} from "../src/language/blockAnalysis";

describe("collectTwigBlockSymbols", () => {
  it("collects block symbols with stable names and ranges", () => {
    const source = [
      "{% block hero %}",
      "  <section>",
      "    {% block content %}",
      "    {% endblock %}",
      "  </section>",
      "{% endblock %}"
    ].join("\n");

    expect(collectTwigBlockSymbols(source).map((symbol) => symbol.name)).toEqual([
      "hero",
      "content"
    ]);
  });

  it("finds a block reference by offset inside the block name", () => {
    const source = "{% block content %}\n{% endblock %}";
    const offset = source.indexOf("content") + 2;

    expect(getBlockReferenceAtOffset(source, offset)).toEqual(
      expect.objectContaining({
        name: "content"
      })
    );
  });

  it("extracts the parent template from an extends tag", () => {
    expect(getExtendsTemplateReference("{% extends 'base.html.twig' %}")).toBe(
      "base.html.twig"
    );
  });
});
