import { describe, expect, it } from "vitest";

import { getTwigTokenContextAtOffset } from "../src/twigTokenContext";

describe("getTwigTokenContextAtOffset", () => {
  it("detects html context outside twig tokens", () => {
    const source = `<p class="a">{{ name }}</p>`;

    expect(getTwigTokenContextAtOffset(source, source.indexOf("class"))).toEqual({
      kind: "html",
      stringLike: false,
      hashKeyLike: false
    });
  });

  it("detects html attribute string context", () => {
    const source = `<a href="s.html">{{ name }}</a>`;

    expect(getTwigTokenContextAtOffset(source, source.indexOf("s.html") + 1)).toEqual({
      kind: "html",
      stringLike: true,
      hashKeyLike: false
    });
  });

  it("detects twig output hash key context", () => {
    const source = `{{ item.value|replace({b: ''}) }}`;

    expect(getTwigTokenContextAtOffset(source, source.indexOf("b:"))).toEqual({
      kind: "output",
      stringLike: false,
      hashKeyLike: true
    });
  });

  it("detects twig output string context", () => {
    const source = `{{ path('blog_show') }}`;

    expect(getTwigTokenContextAtOffset(source, source.indexOf("blog"))).toEqual({
      kind: "output",
      stringLike: true,
      hashKeyLike: false
    });
  });

  it("detects twig tag and comment contexts", () => {
    const tagSource = `{% block content %}`;
    const commentSource = `{# block content #}`;

    expect(getTwigTokenContextAtOffset(tagSource, tagSource.indexOf("block"))).toEqual({
      kind: "tag",
      stringLike: false,
      hashKeyLike: false
    });
    expect(
      getTwigTokenContextAtOffset(commentSource, commentSource.indexOf("block"))
    ).toEqual({
      kind: "comment",
      stringLike: false,
      hashKeyLike: false
    });
  });

  it("handles multiline output tokens without treating quoted text as hash keys", () => {
    const source = ["{{ replace({", "  label: 'b value'", "}) }}"].join("\n");

    expect(getTwigTokenContextAtOffset(source, source.indexOf("label"))).toEqual({
      kind: "output",
      stringLike: false,
      hashKeyLike: true
    });
    expect(getTwigTokenContextAtOffset(source, source.indexOf("b value"))).toEqual({
      kind: "output",
      stringLike: true,
      hashKeyLike: false
    });
  });
});
