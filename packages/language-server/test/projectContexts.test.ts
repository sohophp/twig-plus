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


describe("Controller contexts use resolved template identity", () => {
  const one = "file:///one";
  const two = "file:///two";
  const nested = "file:///one/nested";
  const contexts = [
    { ...context(one, { person: "First" }, "One"), template: "@site/page.html.twig" },
    { ...context(one, { space: "First" }, "Space"), template: "@site/my page.html.twig" },
    { ...context(one, { leak: "Wrong" }, "Foreign"), template: "@catalog/page.html.twig" },
    { ...context(two, { customer: "Second" }, "Two"), template: "@site/page.html.twig" },
    { ...context(two, { item: "Item" }, "Catalog"), template: "@catalog/page.html.twig" }
  ];
  const workspaces = [
    { rootUri: one, templates: ["templates/preferred/page.html.twig", "templates/site/page.html.twig", "templates/foreign/page.html.twig", "templates/preferred/my page.html.twig", "nested/templates/preferred/page.html.twig"],
      namespaces: { site: ["templates/preferred", "templates/site"] } },
    { rootUri: two, templates: ["templates/secondary/page.html.twig", "templates/foreign/page.html.twig"],
      namespaces: { site: ["templates/secondary"], catalog: ["templates/foreign"] } },
    { rootUri: nested, templates: ["templates/preferred/page.html.twig"], namespaces: { site: ["templates/preferred"] } }
  ];
  it("selects namespace overrides and keeps each root's aliases private", () => {
    const index = new ProjectContextIndex(contexts, workspaces);
    expect(index.get(`${one}/templates/preferred/page.html.twig`)?.variables).toEqual({ person: "First" });
    expect(index.get(`${one}/templates/site/page.html.twig`)).toBeUndefined();
    expect(index.get(`${one}/templates/foreign/page.html.twig`)).toBeUndefined();
    expect(index.get(`${two}/templates/secondary/page.html.twig`)?.variables).toEqual({ customer: "Second" });
    expect(index.get(`${two}/templates/foreign/page.html.twig`)?.variables).toEqual({ item: "Item" });
    expect(index.get(`${nested}/templates/preferred/page.html.twig`)).toBeUndefined();
    expect(index.get(`${one}/templates/preferred/my%20page.html.twig`)?.variables).toEqual({ space: "First" });
  });
  it("moves context to the next override after deletion and restores it on recreation", () => {
    const first = new ProjectContextIndex(contexts, workspaces);
    const deleted = new ProjectContextIndex(contexts, [
      { ...workspaces[0]!, templates: workspaces[0]!.templates.filter((file) => file !== "templates/preferred/page.html.twig") },
      ...workspaces.slice(1)
    ]);
    expect(deleted.get(`${one}/templates/site/page.html.twig`)?.variables).toEqual({ person: "First" });
    const uris = [`${one}/templates/preferred/page.html.twig`, `${one}/templates/site/page.html.twig`, `${two}/templates/secondary/page.html.twig`];
    expect(changedContextDocuments(first, deleted, one, uris, false)).toEqual(uris.slice(0, 2));
    const restored = new ProjectContextIndex(contexts, workspaces);
    expect(changedContextDocuments(deleted, restored, one, uris, false)).toEqual(uris.slice(0, 2));
  });
  it("honors namespace order changes without changing another workspace", () => {
    const swapped = new ProjectContextIndex(contexts, [
      { ...workspaces[0]!, namespaces: { site: ["templates/site", "templates/preferred"] } }, ...workspaces.slice(1)
    ]);
    expect(swapped.get(`${one}/templates/site/page.html.twig`)?.variables).toEqual({ person: "First" });
    expect(swapped.get(`${one}/templates/preferred/page.html.twig`)).toBeUndefined();
    expect(swapped.get(`${two}/templates/secondary/page.html.twig`)?.variables).toEqual({ customer: "Second" });
  });
  it("preserves explicit workspace paths and merges aliases of the same resolved file", () => {
    const explicit = { ...context(one, { extra: "int" }, "Explicit"), template: "templates/preferred/page.html.twig" };
    const index = new ProjectContextIndex([...contexts, explicit], workspaces);
    expect(index.get(`${one}/templates/preferred/page.html.twig`)?.variables).toEqual({ extra: "int", person: "First" });
  });
  it("does not leak a plain template into a nested workspace with no contexts", () => {
    const plain = { ...context(one, { person: "First" }, "One"), template: "page.html.twig" };
    const index = new ProjectContextIndex([plain], [
      { rootUri: one, templates: ["templates/page.html.twig", "nested/templates/page.html.twig"] },
      { rootUri: nested, templates: ["templates/page.html.twig"] }
    ]);
    expect(index.get(`${one}/templates/page.html.twig`)?.variables.person).toBe("First");
    expect(index.get(`${nested}/templates/page.html.twig`)).toBeUndefined();
  });
});
