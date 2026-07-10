import { describe, expect, it } from "vitest";

import {
  formatTwigForIntegration,
  getSelectionRangesForIntegration,
  getTemplateCompletionsForIntegration,
  getTwigDiagnosticsForIntegration,
  resolveTemplatePathForIntegration
} from "../../packages/vscode/src/testing/integration";

describe("vscode integration helpers", () => {
  it("formats twig through the vscode-side integration wrapper", async () => {
    const actual = await formatTwigForIntegration("{% if user %}\n<div>{{name}}</div>\n{% endif %}", {
      profile: "phpstorm",
      indentSize: 2,
      printWidth: 100,
      useTabs: false,
      twigTagSpacing: true,
      htmlAttributeWrap: "auto",
      preserveSingleLineBlocks: true,
      lineBreakAfterTwigControlTag: true
    });

    expect(actual).toBe("{% if user %}\n  <div>{{ name }}</div>\n{% endif %}");
  });

  it("returns template completions through the vscode-side integration wrapper", () => {
    expect(
      getTemplateCompletionsForIntegration(
        [
          "templates/base.html.twig",
          "templates/partials/header.html.twig"
        ],
        "partials/"
      )
    ).toEqual(["partials/header.html.twig"]);
  });

  it("returns bundle-style template completions when using Symfony bundle syntax", () => {
    expect(
      getTemplateCompletionsForIntegration(
        [
          "src/BlogBundle/Resources/views/post/show.html.twig",
          "src/BlogBundle/Resources/views/layout.html.twig"
        ],
        "BlogBundle:"
      )
    ).toEqual([
      "BlogBundle::layout.html.twig",
      "BlogBundle:post:show.html.twig"
    ]);
  });

  it("returns diagnostics through the vscode-side integration wrapper", () => {
    expect(
      getTwigDiagnosticsForIntegration("{% include 'missing.html.twig' %}", [
        "templates/base.html.twig"
      ])
    ).toEqual([
      expect.objectContaining({
        severity: "warning"
      })
    ]);
  });

  it("does not flag existing bundle-style references as missing templates", () => {
    expect(
      getTwigDiagnosticsForIntegration(
        "{% extends 'BlogBundle:post:show.html.twig' %}",
        ["src/BlogBundle/Resources/views/post/show.html.twig"]
      )
    ).toEqual([]);
  });

  it("does not flag same-directory template references as missing templates", () => {
    expect(
      getTwigDiagnosticsForIntegration(
        "{% include 'banner.twig' %}",
        [
          "templates/about/index.twig",
          "templates/about/banner.twig"
        ],
        "templates/about/index.twig"
      )
    ).toEqual([]);
  });

  it("expands selection through nested twig and html wrappers", () => {
    const source = [
      "{% block content %}",
      "    <div><span>{{ user.name }}</span></div>",
      "{% endblock %}"
    ].join("\n");

    expect(
      getSelectionRangesForIntegration(source, source.indexOf("name"))
    ).toContain("<span>{{ user.name }}</span>");
  });

  it("resolves same-directory template references for local includes", () => {
    expect(
      resolveTemplatePathForIntegration(
        [
          "templates/about/index.twig",
          "templates/about/banner.twig",
          "templates/shared/banner.twig"
        ],
        "banner.twig",
        "templates/about/index.twig"
      )
    ).toBe("templates/about/banner.twig");
  });
});
