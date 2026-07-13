import { describe, expect, it } from "vitest";
import { createWorkspaceModel } from "../src";

describe("WorkspaceModel", () => {
  const documents = [
    { uri: "/templates/macros/forms.twig", source: `{% macro input(name) %}<input name="{{ name }}">{% endmacro %}` },
    { uri: "/templates/page.twig", source: `{% import "macros/forms.twig" as forms %}{{ forms.input("email") }}` },
    { uri: "/templates/other.twig", source: `{% from "macros/forms.twig" import input as field %}{{ field("name") }}` }
  ];
  const workspace = createWorkspaceModel(documents, (_from, reference) => `/templates/${reference}`);

  it("resolves aliased and from-imported macro calls across templates", () => {
    const page = documents[1].source.indexOf("input");
    const other = documents[2].source.lastIndexOf("field");
    expect(workspace.getDefinition(documents[1].uri, page)).toMatchObject({ uri: documents[0].uri, start: 9 });
    expect(workspace.getDefinition(documents[2].uri, other)).toMatchObject({ uri: documents[0].uri, start: 9 });
  });

  it("finds references from the macro declaration across the workspace", () => {
    const declaration = documents[0].source.indexOf("input");
    expect(workspace.findReferences(documents[0].uri, declaration, true).map((item) => item.uri)).toEqual([
      documents[0].uri, documents[1].uri, documents[2].uri
    ]);
  });

  it("resolves static template references without treating dynamic paths as missing files", () => {
    const offset = documents[1].source.indexOf("macros/forms.twig");
    expect(workspace.getDefinition(documents[1].uri, offset)).toEqual({ uri: documents[0].uri, start: 0, end: 0 });
  });

  it("resolves inherited blocks and self macro calls", () => {
    const inherited = createWorkspaceModel([
      { uri: "/templates/base.twig", source: `{% block body %}Base{% endblock %}{% macro icon() %}x{% endmacro %}{{ _self.icon() }}` },
      { uri: "/templates/child.twig", source: `{% extends "base.twig" %}{% block body %}Child{% endblock %}` }
    ], (_from, reference) => `/templates/${reference}`);
    expect(inherited.getDefinition("/templates/child.twig", 36)).toMatchObject({ uri: "/templates/base.twig", start: 9 });
    expect(inherited.getDefinition("/templates/base.twig", inherited.documents.get("/templates/base.twig")!.document.source.lastIndexOf("icon"))).toMatchObject({ uri: "/templates/base.twig" });
  });

  it("materializes only the source and target documents for definition queries", () => {
    const inputs = [
      { uri: "/templates/macros.twig", source: `{% macro icon() %}x{% endmacro %}` },
      { uri: "/templates/page.twig", source: `{% import "macros.twig" as m %}{{ m.icon() }}` },
      ...Array.from({ length: 500 }, (_, index) => ({ uri: `/templates/unused-${index}.twig`, source: `{{ value_${index} }}` }))
    ];
    const lazy = createWorkspaceModel(inputs, (_from, reference) => `/templates/${reference}`);
    expect(lazy.documents.size).toBe(0);
    expect(lazy.getDefinition("/templates/page.twig", inputs[1].source.indexOf("icon"))).toMatchObject({ uri: "/templates/macros.twig" });
    expect(lazy.documents.size).toBe(2);
  });

  it("cancels long-running workspace reference scans without materializing everything", async () => {
    const inputs = [
      { uri: "/templates/macros.twig", source: `{% macro icon() %}x{% endmacro %}` },
      ...Array.from({ length: 200 }, (_, index) => ({
        uri: `/templates/page-${index}.twig`, source: `{% import "macros.twig" as m %}{{ m.icon() }}`
      }))
    ];
    const cancellable = createWorkspaceModel(inputs, (_from, reference) => `/templates/${reference}`);
    let checks = 0;
    expect(await cancellable.findReferencesAsync("/templates/macros.twig", inputs[0].source.indexOf("icon"), true, () => ++checks > 10)).toEqual([]);
    expect(cancellable.documents.size).toBeLessThan(inputs.length);
  });
});
