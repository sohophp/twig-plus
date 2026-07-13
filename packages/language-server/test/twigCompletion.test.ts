import { describe, expect, it } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import { parseHybridDocument } from "@twig-plus/parser";
import { getTwigCompletions } from "../src/twigCompletion";

describe("Twig completion contexts", () => {
  it("offers tests inside if tag expressions", () => {
    const source = "{% if user is def %}";
    const document = TextDocument.create("file:///completion.html.twig", "twig", 1, source);
    const offset = source.indexOf("def") + 3;
    const labels = getTwigCompletions(document, parseHybridDocument(source), offset).map((item) => item.label);
    expect(labels).toContain("defined");
  });
});
