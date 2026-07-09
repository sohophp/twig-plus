import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { formatTwigDocument } from "../src/formatter/formatTwigDocument";

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
  "script-with-twig"
];

describe("formatTwigDocument fixtures", () => {
  for (const fixtureName of fixtureNames) {
    it(fixtureName, async () => {
      const input = readFixture("input", fixtureName);
      const expected = readFixture("expected", fixtureName);

      const actual = await formatTwigDocument(input, getDefaultOptions());

      expect(actual).toBe(expected);
    });
  }
});

describe("formatTwigDocument options", () => {
  it("wraps long HTML attributes when htmlAttributeWrap is force", async () => {
    const actual = await formatTwigDocument(
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
    const actual = await formatTwigDocument(`<li>{{ item.name }}</li>`, {
      ...getDefaultOptions(),
      preserveSingleLineBlocks: false
    });

    expect(actual).toBe(["<li>", "  {{ item.name }}", "</li>"].join("\n"));
  });

  it("passes printWidth through to embedded script formatting", async () => {
    const actual = await formatTwigDocument(
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
});

function readFixture(kind: "input" | "expected", fixtureName: string): string {
  const filePath = path.join(
    __dirname,
    "fixtures",
    "formatter",
    kind,
    `${fixtureName}.twig`
  );

  return readFileSync(filePath, "utf8");
}

function getDefaultOptions() {
  return {
    indentSize: 2,
    printWidth: 100,
    useTabs: false,
    twigTagSpacing: true,
    htmlAttributeWrap: "auto" as const,
    preserveSingleLineBlocks: true
  };
}
