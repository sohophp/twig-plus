import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { formatTwig } from "../src";

const fixtureNames = [
  "basic-if",
  "if-else",
  "for-else",
  "block-html",
  "single-line-tags",
  "comment-output",
  "html-attribute",
  "nested-html",
  "with-block",
  "broken-fragment",
  "elseif-chain",
  "set-capture",
  "apply-filter",
  "trim-markers",
  "nested-control",
  "mixed-inline-control",
  "leading-close-mixed",
  "text-between-twig-html",
  "style-basic",
  "script-basic",
  "script-with-twig",
  "real-page",
  "real-page-branches",
  "real-page-inline-output",
  "real-page-empty-elseif",
  "real-page-script-mixed",
  "real-page-style-mixed",
  "phpstorm-like-mixed-page",
  "real-page-blank-lines"
];

describe("formatTwigDocument fixtures", () => {
  for (const fixtureName of fixtureNames) {
    it(fixtureName, async () => {
      const input = readFixture("input", fixtureName);
      const expected = readFixture("expected", fixtureName);

      const actual = await formatTwig(input, getDefaultOptions());

      expect(actual).toBe(expected);
      expect(await formatTwig(actual, getDefaultOptions())).toBe(actual);
    });
  }
});

describe("formatTwigDocument options", () => {
  it("wraps long HTML attributes when htmlAttributeWrap is force", async () => {
    const actual = await formatTwig(
      [
        `<div class="hero" data-name="{{ user.name }}" aria-label="Greeting">`,
        `content`,
        `</div>`
      ].join("\n"),
      {
        ...getDefaultOptions(),
        htmlAttributeWrap: "force"
      }
    );

    expect(actual).toBe(
      [
        "<div",
        '  class="hero"',
        '  data-name="{{ user.name }}"',
        '  aria-label="Greeting">',
        "  content",
        "</div>"
      ].join("\n")
    );
  });

  it("expands simple single-line blocks when preserveSingleLineBlocks is false", async () => {
    const actual = await formatTwig(`<li>{{ item.name }}</li>`, {
      ...getDefaultOptions(),
      preserveSingleLineBlocks: false
    });

    expect(actual).toBe(["<li>", "  {{ item.name }}", "</li>"].join("\n"));
  });

  it("passes printWidth through to embedded script formatting", async () => {
    const actual = await formatTwig(
      ["<script>", "const values = [111111, 222222, 333333, 444444];", "</script>"].join("\n"),
      {
        ...getDefaultOptions(),
        printWidth: 20
      }
    );

    expect(actual).toBe(
      [
        "<script>",
        "  const values = [",
        "    111111, 222222,",
        "    333333, 444444,",
        "  ];",
        "</script>"
      ].join("\n")
    );
  });

  it("breaks after twig control tags when markup follows on the same line", async () => {
    const actual = await formatTwig(
      "{% block content %} <div>{{ name }}</div>\n{% endblock %}",
      getDefaultOptions()
    );

    expect(actual).toBe(
      [
        "{% block content %}",
        "  <div>{{ name }}</div>",
        "{% endblock %}"
      ].join("\n")
    );
  });

  it("breaks after inline include directives when markup follows on the same line", async () => {
    const actual = await formatTwig(
      "{% include 'banner.twig' %}<div class=\"page\">test</div>",
      getDefaultOptions()
    );

    expect(actual).toBe(
      [
        "{% include 'banner.twig' %}",
        "<div class=\"page\">test</div>"
      ].join("\n")
    );
  });

  it("breaks after html opening tags when another node follows immediately", async () => {
    const actual = await formatTwig(
      "<div class=\"page\"><div class=\"inner\">test</div>",
      getDefaultOptions()
    );

    expect(actual).toBe(
      [
        "<div class=\"page\">",
        "  <div class=\"inner\">test</div>"
      ].join("\n")
    );
  });
});

function readFixture(kind: "input" | "expected", fixtureName: string): string {
  const filePath = path.join(
    __dirname,
    "fixtures",
    kind,
    `${fixtureName}.twig`
  );

  return readFileSync(filePath, "utf8");
}

function getDefaultOptions() {
  return {
    profile: "phpstorm" as const,
    indentSize: 2,
    printWidth: 100,
    useTabs: false,
    twigTagSpacing: true,
    htmlAttributeWrap: "auto" as const,
    preserveSingleLineBlocks: true,
    lineBreakAfterTwigControlTag: true
  };
}
