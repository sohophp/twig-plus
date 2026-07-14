import { describe, expect, it } from "vitest";

import { analyzeHybridDiagnostics } from "../src/twigDiagnostics";
import { parseHybridDocument } from "../src/hybridAst";

const analyzeDiagnostics = (source: string, paths: string[] = [], current?: string, roots?: string[]) =>
  analyzeHybridDiagnostics(parseHybridDocument(source), paths, current, roots);

describe("Hybrid diagnostics", () => {
  it("reports unclosed structures", () => {
    const diagnostics = analyzeDiagnostics("{% if user %}\n<div>");

    expect(diagnostics).toEqual([
      expect.objectContaining({
        severity: "error",
        message: 'Unclosed Twig tag "if".'
      })
    ]);
  });

  it("reports missing template references", () => {
    const diagnostics = analyzeDiagnostics(
      "{% include 'partials/missing.html.twig' %}",
      ["templates/base.html.twig"]
    );

    expect(diagnostics).toEqual([
      expect.objectContaining({
        severity: "warning",
        message: expect.stringContaining(
          'Template "partials/missing.html.twig" referenced by "include" was not found.'
        )
      })
    ]);
    expect(diagnostics[0].message).toContain("twigPlus.templates.roots");
  });

  it("resolves same-directory template references before reporting missing templates", () => {
    expect(
      analyzeDiagnostics(
        "{% include 'banner.twig' %}",
        [
          "templates/about/index.twig",
          "templates/about/banner.twig"
        ],
        "templates/about/index.twig"
      )
    ).toEqual([]);
  });

  it("reports duplicate block names", () => {
    const diagnostics = analyzeDiagnostics(
      "{% block content %}{% endblock %}\n{% block content %}{% endblock %}"
    );

    expect(diagnostics).toEqual([
      expect.objectContaining({
        severity: "warning",
        message: 'Duplicate Twig block "content".'
      })
    ]);
  });

  it("reports empty output blocks as hints", () => {
    const diagnostics = analyzeDiagnostics("{{    }}");

    expect(diagnostics).toEqual([
      expect.objectContaining({
        severity: "hint",
        message: "Empty Twig output block."
      })
    ]);
  });

  it("reports unexpected middle or closing tags", () => {
    const diagnostics = analyzeDiagnostics("{% else %}\n{% endif %}");

    expect(diagnostics).toEqual([
      expect.objectContaining({
        severity: "error",
        message: 'Unexpected Twig tag "else".'
      }),
      expect.objectContaining({
        severity: "error",
        message: 'Unexpected closing Twig tag "endif".'
      })
    ]);
  });
});
