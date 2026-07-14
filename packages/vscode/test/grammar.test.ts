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

  it("embeds JavaScript-only blocks before the generic Twig tag rule", () => {
    const grammar = JSON.parse(readFileSync(path.resolve(__dirname, "../syntaxes/twig.tmLanguage.json"), "utf8"));
    const embedded = grammar.repository["embedded-javascript-block"];
    const begin = new RegExp(embedded.begin.replace(/^\(\?i\)/, ""), "i");
    expect(begin.test("{% block scriptForLayout %}")).toBe(true);
    expect(begin.test("{%- block scripts -%}")).toBe(true);
    expect(begin.test("{% block description %}")).toBe(false);
    expect(embedded.contentName).toBe("meta.embedded.block.javascript");
    expect(grammar.patterns.findIndex((pattern: { include: string }) => pattern.include === "#embedded-javascript-block"))
      .toBeLessThan(grammar.patterns.findIndex((pattern: { include: string }) => pattern.include === "#twig-tag"));
  });

  it("maps the embedded script scope to the JavaScript language", () => {
    const manifest = JSON.parse(readFileSync(path.resolve(__dirname, "../package.json"), "utf8"));
    expect(manifest.contributes.grammars[0].embeddedLanguages).toEqual({
      "meta.embedded.block.javascript": "javascript"
    });
  });
});
