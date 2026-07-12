import { describe, expect, it } from "vitest";
import { parseHybridDocument } from "@twig-plus/parser";
import { EmbeddedJavaScriptService, isTypeScriptRuntimeLoaded } from "../src/embeddedJavaScript";

async function completions(sourceWithCursor: string): ReturnType<EmbeddedJavaScriptService["getCompletions"]> {
  const offset = sourceWithCursor.lastIndexOf("|");
  const source = sourceWithCursor.slice(0, offset) + sourceWithCursor.slice(offset + 1);
  return new EmbeddedJavaScriptService().getCompletions("file:///template.html.twig", 1, parseHybridDocument(source), offset);
}

async function labels(sourceWithCursor: string): Promise<string[]> {
  return (await completions(sourceWithCursor))?.map((item) => item.label) ?? [];
}

describe("EmbeddedJavaScriptService", () => {
  it("does not load TypeScript for documents without supported scripts", async () => {
    expect(isTypeScriptRuntimeLoaded()).toBe(false);
    expect(await completions(`<div>plain HTML|</div>`)).toBeNull();
    expect(isTypeScriptRuntimeLoaded()).toBe(false);
  });
  it("completes console and DOM members", async () => {
    expect(await labels(`<script>docu|</script>`)).toContain("document");
    expect(await labels(`<script>console.lo|</script>`)).toContain("log");
    expect(await labels(`<script>document.queryS|</script>`)).toContain("querySelector");
    expect(await labels(`<script>docu|</script>`)).not.toContain("DocumentDropEdit");
    const documentMembers = await completions(`<script>document.|</script>`);
    expect(documentMembers?.map((item) => item.label)).not.toContain("ATTRIBUTE_NODE");
    expect(documentMembers?.find((item) => item.label === "addEventListener")?.sortText.startsWith("0_")).toBe(true);
  });

  it("suppresses noisy global suggestions while an arrow body is being started", async () => {
    expect(await completions(`<script>document.addEventListener('DOMContentLoaded',()=>|)</script>`)).toEqual([]);
    expect(await completions(`<script>document.addEventListener('DOMContentLoaded',()=>{|)</script>`)).toEqual([]);
  });

  it("uses local object and function parameter types", async () => {
    expect(await labels(`<script>const user = { name: "Ada", active: true }; user.na|</script>`)).toContain("name");
    expect(await labels(`<script>function render(options = { compact: true }) { options.co| }</script>`)).toContain("compact");
  });

  it("parses module scripts and completes around Twig placeholders", async () => {
    expect(await labels(`<script type="module">export const page = { title: "Home" }; page.ti|</script>`)).toContain("title");
    const result = await completions(`<script>const value = {{ value|json_encode }}; console.lo|</script>`);
    const log = result?.find((item) => item.label === "log");
    expect(log?.replacement).toBeDefined();
  });

  it("adds callable snippets without duplicating existing parentheses", async () => {
    const callable = (await completions(`<script>document.addEven|</script>`))?.find((item) => item.label === "addEventListener");
    expect(callable?.snippet).toBe("addEventListener(${1})");
    const alreadyCalled = (await completions(`<script>document.addEven|()</script>`))?.find((item) => item.label === "addEventListener");
    expect(alreadyCalled?.snippet).toBeUndefined();
  });

  it("does not activate in HTML, Twig expressions, JSON, or import maps", async () => {
    expect(await completions(`<div>console.lo|</div>`)).toBeNull();
    expect(await completions(`<script>{{ console.lo| }}</script>`)).toEqual([]);
    expect(await completions(`<script type="application/json">{"value": "|"}</script>`)).toBeNull();
    expect(await completions(`<script type="importmap">{"imports": {"|": "./x.js"}}</script>`)).toBeNull();
  });

  it("maps JavaScript syntax errors back to the Twig document", async () => {
    const source = `<script>for (let i, i < 3; i++) {}</script>`;
    const diagnostics = await new EmbeddedJavaScriptService().getDiagnostics(
      "file:///template.html.twig", 1, parseHybridDocument(source)
    );
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0].range.start).toBeGreaterThanOrEqual(source.indexOf("for"));
    expect(diagnostics[0].range.end).toBeLessThan(source.indexOf("</script>"));
  });
});
