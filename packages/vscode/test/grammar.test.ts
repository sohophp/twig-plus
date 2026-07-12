import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("Twig TextMate grammar", () => {
  it("embeds JavaScript after the three Twig delimiter rules", () => {
    const grammar = JSON.parse(readFileSync(path.resolve(__dirname, "../syntaxes/twig.tmLanguage.json"), "utf8"));
    const embedded = grammar.repository["embedded-javascript"];
    expect(embedded.contentName).toBe("meta.embedded.block.javascript");
    expect(embedded.patterns.map((pattern: { include: string }) => pattern.include)).toEqual([
      "#twig-comment", "#twig-output", "#twig-tag", "source.js"
    ]);
    expect(grammar.patterns.findIndex((pattern: { include: string }) => pattern.include === "#embedded-javascript"))
      .toBeLessThan(grammar.patterns.findIndex((pattern: { include: string }) => pattern.include === "text.html.basic"));
  });

  it("maps the embedded script scope to the JavaScript language", () => {
    const manifest = JSON.parse(readFileSync(path.resolve(__dirname, "../package.json"), "utf8"));
    expect(manifest.contributes.grammars[0].embeddedLanguages).toEqual({
      "meta.embedded.block.javascript": "javascript"
    });
  });
});
