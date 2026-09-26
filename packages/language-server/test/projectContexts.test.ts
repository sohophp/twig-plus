import { describe, expect, it } from "vitest";
import { changedContextDocuments, mergeProjectContexts, ProjectContextIndex, type LoadedControllerContext } from "../src/projectContexts";

const context = (root: string, variables: Record<string, string>, controller: string): LoadedControllerContext => ({
  projectRootUri: root, template: "site/page.html.twig", complete: true, variables,
  sources: [{ controller, uri: `${root}/src/${controller}.php`, line: 4, character: 0 }]
});

describe("controller template context merging", () => {
  it("merges same-project sources and preserves type alternatives and origins", () => {
    expect(mergeProjectContexts([
      context("file:///one", { user: "App\\User", page: "int" }, "PageController"),
      context("file:///one", { user: "App\\Admin" }, "AdminController")
    ])).toMatchObject([{ complete: true, variables: { page: "int", user: "App\\User|App\\Admin" }, sources: [{ controller: "PageController" }, { controller: "AdminController" }] }]);
  });

  it("does not merge identical template paths across workspace roots", () => {
    const one = { ...context("file:///one", { actor: "App\\Actor" }, "One"), types: { "App\\Actor": { name: "App\\Actor", members: [{ name: "one", kind: "property" as const }] } } };
    const two = { ...context("file:///two", { actor: "App\\Actor" }, "Two"), types: { "App\\Actor": { name: "App\\Actor", members: [{ name: "two", kind: "property" as const }] } } };
    const merged = mergeProjectContexts([one, two]);
    expect(merged).toHaveLength(2);
    expect(merged.find((entry) => entry.projectRootUri === "file:///one")?.types?.["App\\Actor"]?.members[0]?.name).toBe("one");
    expect(merged.find((entry) => entry.projectRootUri === "file:///two")?.types?.["App\\Actor"]?.members[0]?.name).toBe("two");
  });

  it("propagates incomplete contexts and unknown types", () => {
    const incomplete = { ...context("file:///one", { value: "mixed" }, "Dynamic"), complete: false };
    expect(mergeProjectContexts([incomplete, context("file:///one", { value: "App\\Value" }, "Known")])).toMatchObject([{ complete: false, variables: { value: "mixed" } }]);
  });

  it("matches path segments within the correct workspace and prefers the longest template", () => {
    const one = context("file:///one", { actor: "First" }, "One");
    const two = context("file:///two", { actor: "Second" }, "Two");
    const short = { ...one, template: "page.html.twig", variables: { actor: "Short" } };
    const index = new ProjectContextIndex([short, one, two]);
    expect(index.get("file:///one/templates/site/page.html.twig")?.variables.actor).toBe("First");
    expect(index.get("file:///one/other/page.html.twig")?.variables.actor).toBe("Short");
    expect(index.get("file:///two/templates/site/page.html.twig")?.variables.actor).toBe("Second");
    expect(index.get("file:///one-extra/templates/site/page.html.twig")).toBeUndefined();
    expect(index.get("file:///one/templates/anotherpage.html.twig")).toBeUndefined();
  });

  it("handles encoded paths without matching an invalid parent path", () => {
    const index = new ProjectContextIndex([{ ...context("file:///one", { actor: "Encoded" }, "One"), template: "site/my page.html.twig" },
      { ...context("file:///one", {}, "Unsafe"), template: "../outside.html.twig" }]);
    expect(index.get("file:///one/templates/site/my%20page.html.twig")?.variables.actor).toBe("Encoded");
    expect(index.get("file:///one/outside.html.twig")).toBeUndefined();
  });

  it("selects only open templates affected by a context update", () => {
    const before = new ProjectContextIndex([context("file:///one", { actor: "Before" }, "One")]);
    const after = new ProjectContextIndex([context("file:///one", { actor: "After" }, "One")]);
    const changed = "file:///one/templates/site/page.html.twig";
    const unrelated = "file:///one/templates/other.html.twig";
    const otherRoot = "file:///two/templates/site/page.html.twig";
    expect(changedContextDocuments(before, after, "file:///one", [changed, unrelated, otherRoot], false)).toEqual([changed]);
    expect(changedContextDocuments(before, after, "file:///one", [changed, unrelated, otherRoot], true)).toEqual([changed, unrelated]);
  });
});
