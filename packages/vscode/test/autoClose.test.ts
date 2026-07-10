import { describe, expect, it } from "vitest";

import {
  getTwigAutoCloseEdit,
  getTwigAutoCloseBacktrack,
  getTwigEnterEdit,
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
