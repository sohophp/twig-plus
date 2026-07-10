import { describe, expect, it } from "vitest";

import {
  collectTemplateReferenceAliases,
  collectTemplateCompletionCandidates,
  getTemplateReferenceMatch,
  mapWorkspaceTemplateToReference,
  resolveTemplateWorkspacePath
} from "../src/templateCompletion";

describe("getTemplateReferenceMatch", () => {
  it("detects include template string context", () => {
    expect(getTemplateReferenceMatch("{% include 'partials/he")).toEqual({
      directive: "include",
      quote: "'",
      prefix: "partials/he",
      startOffset: 12
    });
  });

  it("detects from template string context", () => {
    expect(getTemplateReferenceMatch('{% from "macros/fo')).toEqual({
      directive: "from",
      quote: "\"",
      prefix: "macros/fo",
      startOffset: 9
    });
  });

  it("returns null outside supported template reference directives", () => {
    expect(getTemplateReferenceMatch("{{ include('partials/header.html.twig')")).toBeNull();
  });
});

describe("template completion candidate helpers", () => {
  it("maps Symfony template roots to Twig references", () => {
    expect(mapWorkspaceTemplateToReference("templates/base.html.twig")).toBe(
      "base.html.twig"
    );
    expect(
      mapWorkspaceTemplateToReference("app/Resources/views/admin/list.html.twig")
    ).toBe("admin/list.html.twig");
    expect(
      mapWorkspaceTemplateToReference(
        "src/BlogBundle/Resources/views/post/show.html.twig"
      )
    ).toBe("post/show.html.twig");
  });

  it("collects relative and bundle aliases for bundle templates", () => {
    expect(
      collectTemplateReferenceAliases(
        "src/BlogBundle/Resources/views/post/show.html.twig"
      )
    ).toEqual([
      "post/show.html.twig",
      "BlogBundle:post:show.html.twig"
    ]);

    expect(
      collectTemplateReferenceAliases(
        "src/BlogBundle/Resources/views/layout.html.twig"
      )
    ).toEqual([
      "layout.html.twig",
      "BlogBundle::layout.html.twig"
    ]);
  });

  it("filters and sorts template candidates by current prefix", () => {
    expect(
      collectTemplateCompletionCandidates(
        [
          "templates/base.html.twig",
          "templates/partials/header.html.twig",
          "templates/partials/footer.html.twig",
          "src/BlogBundle/Resources/views/post/show.html.twig",
          "README.md"
        ],
        "partials/f"
      )
    ).toEqual(["partials/footer.html.twig"]);
  });

  it("returns bundle-style candidates when the current prefix uses bundle syntax", () => {
    expect(
      collectTemplateCompletionCandidates(
        [
          "src/BlogBundle/Resources/views/post/show.html.twig",
          "src/BlogBundle/Resources/views/layout.html.twig",
          "templates/base.html.twig"
        ],
        "BlogBundle:"
      )
    ).toEqual([
      "BlogBundle::layout.html.twig",
      "BlogBundle:post:show.html.twig"
    ]);
  });

  it("resolves a reference path back to the best matching workspace path", () => {
    expect(
      resolveTemplateWorkspacePath(
        [
          "src/BlogBundle/Resources/views/base.html.twig",
          "templates/base.html.twig",
          "app/Resources/views/base.html.twig"
        ],
        "base.html.twig"
      )
    ).toBe("templates/base.html.twig");
  });

  it("resolves same-directory template references relative to the current file", () => {
    expect(
      resolveTemplateWorkspacePath(
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

  it("suggests same-directory bare filenames for local includes", () => {
    expect(
      collectTemplateCompletionCandidates(
        [
          "templates/about/index.twig",
          "templates/about/banner.twig",
          "templates/shared/banner.twig"
        ],
        "ban",
        "templates/about/index.twig"
      )
    ).toContain("banner.twig");
  });

  it("resolves bundle-style references back to bundle templates", () => {
    expect(
      resolveTemplateWorkspacePath(
        [
          "src/BlogBundle/Resources/views/post/show.html.twig",
          "src/BlogBundle/Resources/views/layout.html.twig"
        ],
        "BlogBundle:post:show.html.twig"
      )
    ).toBe("src/BlogBundle/Resources/views/post/show.html.twig");

    expect(
      resolveTemplateWorkspacePath(
        ["src/BlogBundle/Resources/views/layout.html.twig"],
        "BlogBundle::layout.html.twig"
      )
    ).toBe("src/BlogBundle/Resources/views/layout.html.twig");
  });
});
