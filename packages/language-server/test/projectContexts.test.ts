import { describe, expect, it } from "vitest";
import { mergeProjectContexts, type LoadedControllerContext } from "../src/projectContexts";

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
});
