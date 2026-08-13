import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("Twig TextMate grammar", () => {
  it("embeds JavaScript after the three Twig delimiter rules", () => {
    const grammar = JSON.parse(readFileSync(path.resolve(__dirname, "../syntaxes/twig.tmLanguage.json"), "utf8"));
    const embedded = grammar.repository["embedded-javascript"];
    const body = embedded.patterns.find((pattern: { contentName?: string }) => pattern.contentName === "meta.embedded.block.javascript");
    expect(body.patterns.map((pattern: { include: string }) => pattern.include)).toEqual([
      "#twig-comment", "#twig-output", "#twig-tag", "source.js"
    ]);
    expect(grammar.patterns.findIndex((pattern: { include: string }) => pattern.include === "#embedded-javascript"))
      .toBeLessThan(grammar.patterns.findIndex((pattern: { include: string }) => pattern.include === "text.html.basic"));
  });

  it("classifies script tag names and attributes as HTML before embedding JavaScript", () => {
    const grammar = JSON.parse(readFileSync(path.resolve(__dirname, "../syntaxes/twig.tmLanguage.json"), "utf8"));
    const embedded = grammar.repository["embedded-javascript"];
    expect(embedded.beginCaptures["2"].name).toBe("entity.name.tag.script.html");
    const opening = embedded.patterns[0];
    expect(opening.name).toBe("meta.tag.script.begin.html");
    expect(opening.patterns).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "entity.other.attribute-name.html" })
    ]));
  });

  it("maps the embedded script scope to the JavaScript language", () => {
    const manifest = JSON.parse(readFileSync(path.resolve(__dirname, "../package.json"), "utf8"));
    expect(manifest.contributes.grammars[0].embeddedLanguages).toEqual({
      "meta.embedded.block.javascript": "javascript"
    });
  });

  it("injects Twig delimiters into nested HTML attribute strings", () => {
    const manifest = JSON.parse(readFileSync(path.resolve(__dirname, "../package.json"), "utf8"));
    const injectionContribution = manifest.contributes.grammars.find(
      (grammar: { scopeName: string }) => grammar.scopeName === "text.html.twigplus.injection"
    );
    expect(injectionContribution).toMatchObject({
      path: "./syntaxes/twig-injection.tmLanguage.json",
      injectTo: ["text.html.twigplus"]
    });

    const injection = JSON.parse(readFileSync(path.resolve(__dirname, "../syntaxes/twig-injection.tmLanguage.json"), "utf8"));
    expect(injection.injectionSelector).toBe("L:text.html.twigplus");
    expect(injection.patterns.map((pattern: { include: string }) => pattern.include)).toEqual([
      "text.html.twigplus#twig-comment", "text.html.twigplus#twig-output", "text.html.twigplus#twig-tag"
    ]);
  });

  it("classifies Twig expressions inside output blocks and control tags", () => {
    const grammar = JSON.parse(readFileSync(path.resolve(__dirname, "../syntaxes/twig.tmLanguage.json"), "utf8"));
    expect(grammar.repository["twig-output"].patterns).toContainEqual({ include: "#twig-expression" });
    expect(grammar.repository["twig-tag"].patterns).toContainEqual({ include: "#twig-expression" });
    const scopes = grammar.repository["twig-expression"].patterns.map((pattern: { name: string }) => pattern.name);
    expect(scopes).toEqual(expect.arrayContaining([
      "support.function.twig", "variable.other.property.twig", "variable.other.twig", "keyword.operator.twig"
    ]));
  });
});
