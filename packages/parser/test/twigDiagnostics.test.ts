import { describe, expect, it } from "vitest";

import { analyzeTwigDiagnostics } from "../src/twigDiagnostics";

describe("analyzeTwigDiagnostics", () => {
  it("reports unclosed structures", () => {
    const diagnostics = analyzeTwigDiagnostics("{% if user %}\n<div>");

    expect(diagnostics).toEqual([
      expect.objectContaining({
        severity: "error",
        message: 'Unclosed Twig tag "if".'
      })
    ]);
  });

  it("reports missing template references", () => {
    const diagnostics = analyzeTwigDiagnostics(
      "{% include 'partials/missing.html.twig' %}",
      ["templates/base.html.twig"]
    );

    expect(diagnostics).toEqual([
      expect.objectContaining({
        severity: "warning",
        message:
          'Template "partials/missing.html.twig" referenced by "include" was not found.'
      })
    ]);
  });

  it("resolves same-directory template references before reporting missing templates", () => {
    expect(
      analyzeTwigDiagnostics(
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
    const diagnostics = analyzeTwigDiagnostics(
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
    const diagnostics = analyzeTwigDiagnostics("{{    }}");

    expect(diagnostics).toEqual([
      expect.objectContaining({
        severity: "hint",
        message: "Empty Twig output block."
      })
    ]);
  });

  it("reports unexpected middle or closing tags", () => {
    const diagnostics = analyzeTwigDiagnostics("{% else %}\n{% endif %}");

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
