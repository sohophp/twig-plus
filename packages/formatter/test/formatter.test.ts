import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { formatTwig, formatTwigWithResult } from "../src";

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
  "real-page-blank-lines",
  "messy-html-attributes",
  "messy-twig-expressions",
  "inline-block-children"
];

describe("formatTwigDocument fixtures", () => {
  for (const fixtureName of fixtureNames) {
    it(fixtureName, async () => {
      const input = readFixture("input", fixtureName);
      const expected = readFixture("expected", fixtureName);

      const actual = await formatTwig(input, getDefaultOptions());

      expect(actual).toBe(expected);
      const second = await formatTwig(actual, getDefaultOptions());
      expect(second).toBe(actual);
      expect(await formatTwig(second, getDefaultOptions())).toBe(actual);
    });
  }
});

describe("structured formatter results", () => {
  it("returns stage timings and an atomic success result", async () => {
    const result = await formatTwigWithResult("{%if user%}\n<div>{{name}}</div>\n{%endif%}", getDefaultOptions());
    expect(result.ok).toBe(true);
    expect(result.timings.map((timing) => timing.stage)).toEqual(expect.arrayContaining(["parse", "twig", "html", "complete"]));
    expect(result.timings.every((timing) => timing.startedAt >= 0 && timing.durationMs >= 0)).toBe(true);
    if (result.ok) expect(result.text).toContain("{% if user %}");
  });

  it("returns no partial text for embedded syntax failures", async () => {
    const result = await formatTwigWithResult("<script>for (let i, i < 3; i++) {}</script>", getDefaultOptions());
    expect(result).toMatchObject({ ok: false, error: { code: "embedded-syntax", language: "script" } });
    expect("text" in result).toBe(false);
  });

  it("records real embedded and mapping stages once in hybrid mode", async () => {
    const stages: string[] = [];
    const result = await formatTwigWithResult("<script>document.addEventListener('load', () => {});</script>", {
      ...getDefaultOptions(), parserEngine: "hybrid", onStage: (stage) => stages.push(stage)
    });
    expect(result.ok).toBe(true);
    expect(stages.filter((stage) => stage === "javascript")).toHaveLength(1);
    expect(stages).toEqual(expect.arrayContaining(["parse", "twig", "html", "mapping", "javascript", "complete"]));
  });

  it("honours cancellation before formatting starts", async () => {
    const result = await formatTwigWithResult("<div></div>", { ...getDefaultOptions(), isCancellationRequested: () => true });
    expect(result).toMatchObject({ ok: false, error: { code: "cancelled" } });
  });
});

describe("embedded syntax errors", () => {
  it("preserves an invalid JavaScript document across repeated formatting", async () => {
    const source = `{% block body %}\n    <script>\n        document.addEventListener("DOMContentLoaded", () => {});\n        const b = "{{ b.value|raw }}";\n        for (let i, i < 3; i++) {}\n    </script>\n{% endblock %}`;
    const once = await formatTwig(source, getDefaultOptions());
    const twice = await formatTwig(once, getDefaultOptions());
    expect(once).toBe(source);
    expect(twice).toBe(source);
  });

  it("reports why formatting was skipped", async () => {
    const messages: string[] = [];
    const source = `<script>for (let i, i < 3; i++) {}</script>`;
    expect(await formatTwig(source, {
      ...getDefaultOptions(),
      onEmbeddedSyntaxError: (error) => messages.push(`${error.language}: ${error.message}`)
    })).toBe(source);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("script:");
  });
});

describe("hybrid formatter compatibility", () => {
  it.each(["hybrid-shadow", "hybrid"] as const)("keeps all golden fixtures identical in %s mode", async (parserEngine) => {
    for (const fixtureName of fixtureNames) {
      const input = readFixture("input", fixtureName);
      const expected = readFixture("expected", fixtureName);
      const options = { ...getDefaultOptions(), parserEngine };
      const actual = await formatTwig(input, options);
      expect(actual).toBe(expected);
      expect(await formatTwig(actual, options)).toBe(actual);
    }
  });

  it("preserves legacy fallback behavior for incomplete and CRLF input", async () => {
    for (const source of ["{% bl", "<div class=\"hero\"", "{% if user %}\r\n<div>{{name}}</div>"]) {
      const legacy = await formatTwig(source, getDefaultOptions());
      expect(await formatTwig(source, { ...getDefaultOptions(), parserEngine: "hybrid" })).toBe(legacy);
    }
  });
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

  it("normalizes broken inline html and twig output spacing", async () => {
    const actual = await formatTwig(
      [
        `<a href="{{ path('about') }}" title="{{ __('About', 'About') }}"`,
        `                        >{{ __('About', 'About') }}</a>`
      ].join("\n"),
      getDefaultOptions()
    );

    expect(actual).toBe(
      `<a href="{{ path('about') }}" title="{{ __('About', 'About') }}">{{ __('About', 'About') }}</a>`
    );
    expect(await formatTwig(actual, getDefaultOptions())).toBe(actual);
  });

  it("normalizes nested broken html tag boundaries and extra child whitespace", async () => {
    const actual = await formatTwig(
      [
        `  <li>`,
        `                        <a href="{{ path('about') }}" title="{{ __('About', 'About') }}"      `,
        `                         >      {{ __('About', 'About') }}</a>`,
        `                    </li>`
      ].join("\n"),
      getDefaultOptions()
    );

    expect(actual).toBe(
      [
        "<li>",
        `  <a href="{{ path('about') }}" title="{{ __('About', 'About') }}">{{ __('About', 'About') }}</a>`,
        "</li>"
      ].join("\n")
    );
    expect(await formatTwig(actual, getDefaultOptions())).toBe(actual);
  });

  it("normalizes multiline twig include tags", async () => {
    const actual = await formatTwig(
      [" {% include 'banner.twig'", "", "        %}"].join("\n"),
      getDefaultOptions()
    );

    expect(actual).toBe("{% include 'banner.twig' %}");
    expect(await formatTwig(actual, getDefaultOptions())).toBe(actual);
  });

  it("normalizes multiline twig output filters inside html wrappers", async () => {
    const actual = await formatTwig(
      [` <div class="editor">{{ content.content|`, `        raw }}</div>`].join("\n"),
      getDefaultOptions()
    );

    expect(actual).toBe(`<div class="editor">{{ content.content|raw }}</div>`);
    expect(await formatTwig(actual, getDefaultOptions())).toBe(actual);
  });

  it("normalizes html attribute assignment spacing", async () => {
    const actual = await formatTwig(
      [`    <div class  ="a">`, `    </div>`].join("\n"),
      getDefaultOptions()
    );

    expect(actual).toBe([`<div class="a">`, `</div>`].join("\n"));
    expect(await formatTwig(actual, getDefaultOptions())).toBe(actual);
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
