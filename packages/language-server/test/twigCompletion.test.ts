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
    registry.setPackages(["symfony/twig-bundle", "symfony/routing"]);
    expect(functionLabels()).toContain("path");

    const formSource = "{{ form_st }}";
    const formDocument = TextDocument.create("file:///form.twig", "twig", 1, formSource);
    const formLabels = () => getTwigCompletions(formDocument, parseHybridDocument(formSource), formSource.indexOf("form_st") + 7, registry).map((item) => item.label);
    expect(formLabels()).not.toContain("form_start");
    registry.setPackages(["symfony/twig-bundle", "symfony/twig-bridge", "symfony/form"]);
    expect(formLabels()).toContain("form_start");

    const filterSource = "{{ value|markdown }}";
    const filterDocument = TextDocument.create("file:///filter.twig", "twig", 1, filterSource);
    const filterLabels = () => getTwigCompletions(filterDocument, parseHybridDocument(filterSource), filterSource.indexOf("markdown") + 8, registry).map((item) => item.label);
    expect(filterLabels()).not.toContain("markdown_to_html");
    registry.setPackages(["twig/markdown-extra"]);
    expect(filterLabels()).toContain("markdown_to_html");
  });

  it("filters versioned language facts using the selected Twig resource version", () => {
    const tagSource = "{% gu %}";
    const tagDocument = TextDocument.create("file:///version.twig", "twig", 1, tagSource);
    const tagSyntax = parseHybridDocument(tagSource);
    expect(getTwigCompletions(tagDocument, tagSyntax, 5, undefined, "3.12").map((item) => item.label)).not.toContain("guard");
    expect(getTwigCompletions(tagDocument, tagSyntax, 5, undefined, "3.15").map((item) => item.label)).toContain("guard");

    const filterSource = "{{ values|fi }}";
    const filterDocument = TextDocument.create("file:///version-filter.twig", "twig", 1, filterSource);
    const filterSyntax = parseHybridDocument(filterSource);
    const offset = filterSource.indexOf("fi") + 2;
    expect(getTwigCompletions(filterDocument, filterSyntax, offset, undefined, "3.8").map((item) => item.label)).not.toContain("find");
    expect(getTwigCompletions(filterDocument, filterSyntax, offset, undefined, "3.12").map((item) => item.label)).toContain("find");
  });

  it("uses the installed Symfony Bridge version for callable completion", () => {
    const registry = new TwigCompletionRegistry();
    registry.setPackages(["symfony/twig-bundle", "symfony/twig-bridge", "symfony/security-core", "symfony/form"]);
    const labelsFor = (source: string) => {
      const document = TextDocument.create("file:///symfony-version.twig", "twig", 1, source);
      return getTwigCompletions(document, parseHybridDocument(source), source.indexOf(" }}"), registry).map((item) => item.label);
    };
    registry.setPackageVersions({ "symfony/twig-bridge": "6.4.42" });
    expect(labelsFor("{{ access_dec }}")).not.toContain("access_decision");
    registry.setPackageVersions({ "symfony/twig-bridge": "7.4.14" });
    expect(labelsFor("{{ access_dec }}")).toContain("access_decision");
    expect(labelsFor("{{ form_flow_st }}")).not.toContain("form_flow_steps");
    registry.setPackageVersions({ "symfony/twig-bridge": "8.1.1" });
    expect(labelsFor("{{ form_flow_st }}")).toContain("form_flow_steps");
  });
});
