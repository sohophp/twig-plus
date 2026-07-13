import { describe, expect, it } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import { parseHybridDocument } from "@twig-plus/parser";
import { getTwigCompletions, TwigCompletionRegistry } from "../src/twigCompletion";

describe("Twig completion contexts", () => {
  it("offers tests inside if tag expressions", () => {
    const source = "{% if user is def %}";
    const document = TextDocument.create("file:///completion.html.twig", "twig", 1, source);
    const offset = source.indexOf("def") + 3;
    const labels = getTwigCompletions(document, parseHybridDocument(source), offset).map((item) => item.label);
    expect(labels).toContain("defined");
  });

  it("only exposes optional Symfony and Extra symbols for installed packages", () => {
    const registry = new TwigCompletionRegistry();
    const functionSource = "{{ pa }}";
    const functionDocument = TextDocument.create("file:///function.twig", "twig", 1, functionSource);
    const functionLabels = () => getTwigCompletions(functionDocument, parseHybridDocument(functionSource), 5, registry).map((item) => item.label);
    expect(functionLabels()).not.toContain("path");
    registry.setPackages(["symfony/twig-bundle"]);
    expect(functionLabels()).toContain("path");

    const filterSource = "{{ value|markdown }}";
    const filterDocument = TextDocument.create("file:///filter.twig", "twig", 1, filterSource);
    const filterLabels = () => getTwigCompletions(filterDocument, parseHybridDocument(filterSource), filterSource.indexOf("markdown") + 8, registry).map((item) => item.label);
    expect(filterLabels()).not.toContain("markdown_to_html");
    registry.setPackages(["twig/markdown-extra"]);
    expect(filterLabels()).toContain("markdown_to_html");
  });
});
