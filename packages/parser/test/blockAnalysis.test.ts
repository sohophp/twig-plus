import { describe, expect, it } from "vitest";

import {
  collectTwigBlockSymbols,
  collectTwigMacroImports,
  collectTwigStructureSymbols,
  getBlockReferenceAtOffset,
  getTwigMacroReferenceAtOffset,
  getExtendsTemplateReference
} from "../src/blockAnalysis";
import {
  collectUnclosedTwigControlTags,
  getTwigCompletionContext
} from "../src/twigStructure";

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

  it("collects macro and set capture symbols alongside blocks", () => {
    const source = [
      "{% macro card(title) %}",
      "  <div>{{ title }}</div>",
      "{% endmacro %}",
      "{% set teaser %}",
      "  <p>{{ text }}</p>",
      "{% endset %}"
    ].join("\n");

    expect(
      collectTwigStructureSymbols(source).map((symbol) => `${symbol.kind}:${symbol.name}`)
    ).toEqual([
      "macro:card",
      "set:teaser"
    ]);
  });

  it("tracks unmatched control tags before the current offset", () => {
    const source = [
      "{% block content %}",
      "    {% if user %}",
      "        <div>{{ user.name }}</div>",
      "    {% endif %}",
      ""
    ].join("\n");

    expect(collectUnclosedTwigControlTags(source, source.length)).toEqual([
      "block"
    ]);
  });

  it("reports legal middle-tag completions from the current control context", () => {
    const ifSource = "{% if user %}\n  <div>\n";
    const forSource = "{% for item in items %}\n  <div>\n";

    expect(getTwigCompletionContext(ifSource, ifSource.length).allowedMiddleTags).toEqual([
      "else",
      "elseif"
    ]);
    expect(getTwigCompletionContext(forSource, forSource.length).allowedMiddleTags).toEqual([
      "else",
      "empty"
    ]);
  });

  it("stops suggesting invalid middle tags after else or empty has already appeared", () => {
    const afterElseIfSource = [
      "{% if user %}",
      "  {{ user.name }}",
      "{% else %}",
      "  {{ __('Guest') }}",
      ""
    ].join("\n");
    const afterEmptyForSource = [
      "{% for item in items %}",
      "  {{ item.name }}",
      "{% empty %}",
      "  {{ __('Empty') }}",
      ""
    ].join("\n");

    expect(
      getTwigCompletionContext(afterElseIfSource, afterElseIfSource.length).allowedMiddleTags
    ).toEqual([]);
    expect(
      getTwigCompletionContext(afterEmptyForSource, afterEmptyForSource.length).allowedMiddleTags
    ).toEqual([]);
  });

  it("returns preferred closing tags from the innermost unclosed structure outward", () => {
    const source = [
      "{% block content %}",
      "  {% if user %}",
      "    {% for item in items %}",
      "      {{ item.name }}",
      ""
    ].join("\n");

    expect(getTwigCompletionContext(source, source.length).preferredClosingTags).toEqual([
      "endfor",
      "endif",
      "endblock"
    ]);
  });

  it("collects macro imports from import and from tags", () => {
    const source = [
      "{% import 'macros/forms.twig' as forms %}",
      "{% from 'macros/forms.twig' import input, textarea as area %}"
    ].join("\n");

    expect(collectTwigMacroImports(source)).toEqual([
      {
        kind: "import",
        template: "macros/forms.twig",
        exportedName: "*",
        localName: "forms",
        alias: "forms"
      },
      {
        kind: "from",
        template: "macros/forms.twig",
        exportedName: "input",
        localName: "input",
        alias: null
      },
      {
        kind: "from",
        template: "macros/forms.twig",
        exportedName: "textarea",
        localName: "area",
        alias: null
      }
    ]);
  });

  it("finds macro references for import aliases, from imports, and _self calls", () => {
    const imported = "{{ forms.input(user.email) }}";
    const importedOffset = imported.indexOf("input") + 2;
    const fromImported = "{{ input(user.email) }}";
    const fromImportedOffset = fromImported.indexOf("input") + 2;
    const selfImported = "{{ _self.card(user.email) }}";
    const selfImportedOffset = selfImported.indexOf("card") + 1;

    expect(getTwigMacroReferenceAtOffset(imported, importedOffset)).toEqual({
      alias: "forms",
      kind: "import",
      name: "input"
    });
    expect(getTwigMacroReferenceAtOffset(fromImported, fromImportedOffset)).toEqual({
      alias: null,
      kind: "from",
      name: "input"
    });
    expect(getTwigMacroReferenceAtOffset(selfImported, selfImportedOffset)).toEqual({
      alias: "_self",
      kind: "self",
      name: "card"
    });
  });
});
