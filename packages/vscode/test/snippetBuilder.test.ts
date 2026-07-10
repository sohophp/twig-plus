import { describe, expect, it } from "vitest";

import { buildTwigTagInsertText } from "../src/language/snippetBuilder";

describe("buildTwigTagInsertText", () => {
  it("keeps single tag insert text unchanged when auto closing is disabled", () => {
    expect(
      buildTwigTagInsertText(
        {
          label: "if",
          detail: "Twig tag",
          documentation: "Insert an if tag.",
          insertText: "if ${1:condition}"
        },
        false,
        "    ",
        "  "
      )
    ).toBe("if ${1:condition}");
  });

  it("builds an indented paired block snippet when auto closing is enabled", () => {
    expect(
      buildTwigTagInsertText(
        {
          label: "if",
          detail: "Twig tag",
          documentation: "Insert an if / endif block.",
          insertText: "if ${1:condition}"
        },
        true,
        "    ",
        "  "
      )
    ).toBe("if ${1:condition} %}\n      $0\n    {% endif");
  });

  it("leaves non-paired tags unchanged even when auto closing is enabled", () => {
    expect(
      buildTwigTagInsertText(
        {
          label: "include",
          detail: "Twig tag",
          documentation: "Insert an include tag.",
          insertText: "include '${1:template.html.twig}'"
        },
        true,
        "",
        "    "
      )
    ).toBe("include '${1:template.html.twig}'");
  });
});
