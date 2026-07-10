import { describe, expect, it } from "vitest";

import {
  getHtmlAttributeQuoteAutoCloseEdit,
  getHtmlAutoCloseTagEdit,
  getTwigAutoCloseEdit,
  getTwigAutoCloseEditAtOffset,
  getTwigAutoCloseBacktrack,
  getTwigEnterEdit,
  getTwigExpressionPairAutoCloseEdit,
  getTwigSpacingEdit
} from "../src/language/autoClose";

describe("getTwigAutoCloseEdit", () => {
  it("normalizes twig tag auto closing with inner spaces", () => {
    expect(getTwigAutoCloseEdit("{%%}")).toEqual({
      replacement: "{%  %}",
      replaceLength: 4,
      cursorOffset: 3
    });
  });

  it("normalizes twig output auto closing with inner spaces", () => {
    expect(getTwigAutoCloseEdit("{{}}")).toEqual({
      replacement: "{{  }}",
      replaceLength: 4,
      cursorOffset: 3
    });
  });

  it("normalizes twig comment auto closing with inner spaces", () => {
    expect(getTwigAutoCloseEdit("{##}")).toEqual({
      replacement: "{#  #}",
      replaceLength: 4,
      cursorOffset: 3
    });
  });

  it("normalizes short auto-closed twig tag variants produced by VSCode typing", () => {
    expect(getTwigAutoCloseEdit("{%}")).toEqual({
      replacement: "{%  %}",
      replaceLength: 3,
      cursorOffset: 3
    });
    expect(getTwigAutoCloseEdit("{{}")).toEqual({
      replacement: "{{  }}",
      replaceLength: 3,
      cursorOffset: 3
    });
  });

  it("recognizes VSCode auto-closed second-character insertions for twig delimiters", () => {
    expect(getTwigAutoCloseBacktrack("%}", "{")).toBe(-1);
    expect(getTwigAutoCloseBacktrack("}}", "{")).toBe(-1);
    expect(getTwigAutoCloseBacktrack("{%", "")).toBe(0);
  });

  it("expands enter between paired twig control tags into an indented block line", () => {
    expect(getTwigEnterEdit("{% if user %}", "{% endif %}", "    ")).toEqual({
      replacement: "    \n{% endif %}",
      cursorColumn: 4
    });
  });

  it("does not rewrite enter when the closing tag does not match the opening tag", () => {
    expect(getTwigEnterEdit("{% if user %}", "{% endfor %}", "    ")).toBeNull();
  });

  it("expands enter between twig output delimiters into an indented inner line", () => {
    expect(getTwigEnterEdit("{{", "}}", "    ")).toEqual({
      replacement: "    \n}}",
      cursorColumn: 4
    });
  });

  it("expands enter between twig comment delimiters into an indented inner line", () => {
    expect(getTwigEnterEdit("{#", "#}", "  ")).toEqual({
      replacement: "  \n#}",
      cursorColumn: 2
    });
  });

  it("normalizes compact twig tag spacing when the closing delimiter is typed", () => {
    expect(getTwigSpacingEdit("{%block name%}", "{%block name%}".length)).toEqual({
      tokenStart: 0,
      tokenEnd: 14,
      replacement: "{% block name %}",
      cursorColumn: 16
    });
  });
});

describe("getTwigAutoCloseEditAtOffset", () => {
  it("normalizes VSCode-produced compact twig tags at the cursor", () => {
    expect(getTwigAutoCloseEditAtOffset("{%%}", 2)).toEqual({
      replacement: "{%  %}",
      replaceLength: 4,
      cursorOffset: 3,
      startOffset: 0
    });
  });

  it("normalizes brace-pair fallback twig tags at the cursor", () => {
    expect(getTwigAutoCloseEditAtOffset("{%}", 2)).toEqual({
      replacement: "{%  %}",
      replaceLength: 3,
      cursorOffset: 3,
      startOffset: 0
    });
  });

  it("normalizes output and comment delimiters at the cursor", () => {
    expect(getTwigAutoCloseEditAtOffset("{{}}", 2)).toEqual({
      replacement: "{{  }}",
      replaceLength: 4,
      cursorOffset: 3,
      startOffset: 0
    });
    expect(getTwigAutoCloseEditAtOffset("{##}", 2)).toEqual({
      replacement: "{#  #}",
      replaceLength: 4,
      cursorOffset: 3,
      startOffset: 0
    });
  });

  it("does not rewrite delimiters that already contain inner spacing", () => {
    expect(getTwigAutoCloseEditAtOffset("{%  %}", 3)).toBeNull();
  });
});

describe("getTwigExpressionPairAutoCloseEdit", () => {
  it("inserts a closing parenthesis before a twig output delimiter", () => {
    const source = `<a href="{{ url( }}">`;

    expect(getTwigExpressionPairAutoCloseEdit(source, source.indexOf("(") + 1)).toEqual({
      insertText: ")",
      cursorOffsetDelta: 0
    });
  });

  it("inserts a closing brace before a twig output delimiter", () => {
    const source = `{{ url({) }}`;

    expect(getTwigExpressionPairAutoCloseEdit(source, source.indexOf("{)") + 1)).toEqual({
      insertText: "}",
      cursorOffsetDelta: 0
    });
  });

  it("does not insert a parenthesis when one already exists", () => {
    const source = `<a href="{{ url() }}">`;

    expect(getTwigExpressionPairAutoCloseEdit(source, source.indexOf("(") + 1)).toBeNull();
  });

  it("does not insert expression pairs outside a twig token", () => {
    expect(getTwigExpressionPairAutoCloseEdit("url(", 4)).toBeNull();
    expect(getTwigExpressionPairAutoCloseEdit("url({", 5)).toBeNull();
  });
});

describe("getHtmlAutoCloseTagEdit", () => {
  it("inserts an html closing tag after a normal opening tag", () => {
    expect(getHtmlAutoCloseTagEdit("<p>", 3)).toEqual({
      insertText: "</p>",
      cursorOffsetDelta: 0
    });
  });

  it("inserts an html closing tag after an opening tag with attributes", () => {
    const source = '<a href="{{ url() }}">';

    expect(getHtmlAutoCloseTagEdit(source, source.length)).toEqual({
      insertText: "</a>",
      cursorOffsetDelta: 0
    });
  });

  it("does not close void or self-closing html tags", () => {
    expect(getHtmlAutoCloseTagEdit("<br>", 4)).toBeNull();
    expect(getHtmlAutoCloseTagEdit("<input />", 9)).toBeNull();
  });

  it("does not duplicate an existing closing tag", () => {
    expect(getHtmlAutoCloseTagEdit("<p></p>", 3)).toBeNull();
  });
});

describe("getHtmlAttributeQuoteAutoCloseEdit", () => {
  it("inserts double quotes after an html attribute assignment", () => {
    expect(getHtmlAttributeQuoteAutoCloseEdit("<a href=", 8)).toEqual({
      insertText: "\"\"",
      cursorOffsetDelta: 1
    });
  });

  it("inserts quotes before the tag close without consuming it", () => {
    const source = "<a href=>";

    expect(getHtmlAttributeQuoteAutoCloseEdit(source, source.indexOf("=") + 1)).toEqual({
      insertText: "\"\"",
      cursorOffsetDelta: 1
    });
  });

  it("supports boolean-like attributes after the user types equals", () => {
    expect(getHtmlAttributeQuoteAutoCloseEdit("<input disabled=", 16)).toEqual({
      insertText: "\"\"",
      cursorOffsetDelta: 1
    });
  });

  it("does not duplicate existing quoted attribute values", () => {
    const doubleQuoted = "<a href=\"\"";
    const singleQuoted = "<a href=''";

    expect(
      getHtmlAttributeQuoteAutoCloseEdit(doubleQuoted, doubleQuoted.indexOf("=") + 1)
    ).toBeNull();
    expect(
      getHtmlAttributeQuoteAutoCloseEdit(singleQuoted, singleQuoted.indexOf("=") + 1)
    ).toBeNull();
  });

  it("adds a separating space before non-whitespace attribute tail text", () => {
    const source = "<a href=class";

    expect(getHtmlAttributeQuoteAutoCloseEdit(source, source.indexOf("=") + 1)).toEqual({
      insertText: "\"\" ",
      cursorOffsetDelta: 1
    });
  });

  it("does not trigger inside twig tokens", () => {
    const source = "{{ a = }}";

    expect(getHtmlAttributeQuoteAutoCloseEdit(source, source.indexOf("=") + 1)).toBeNull();
  });

  it("does not trigger in closing tags, text content, or quoted values", () => {
    expect(getHtmlAttributeQuoteAutoCloseEdit("</a href=", 9)).toBeNull();
    expect(getHtmlAttributeQuoteAutoCloseEdit("href=", 5)).toBeNull();

    const quotedValue = "<a title=\"href=";
    expect(
      getHtmlAttributeQuoteAutoCloseEdit(quotedValue, quotedValue.indexOf("=") + 1)
    ).toBeNull();
  });
});
