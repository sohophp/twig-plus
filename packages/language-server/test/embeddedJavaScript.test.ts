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

async function definition(sourceWithCursor: string) {
  const offset = sourceWithCursor.lastIndexOf("|");
  const source = sourceWithCursor.slice(0, offset) + sourceWithCursor.slice(offset + 1);
  const result = await new EmbeddedJavaScriptService().getDefinition(
    "file:///template.html.twig", 1, parseHybridDocument(source), offset
  );
  return { source, result };
}

async function prepareRename(sourceWithCursor: string) {
  const offset = sourceWithCursor.lastIndexOf("|");
  const source = sourceWithCursor.slice(0, offset) + sourceWithCursor.slice(offset + 1);
  const result = await new EmbeddedJavaScriptService().prepareRename(
    "file:///template.html.twig", 1, parseHybridDocument(source), offset
  );
  return { source, result };
}

async function rename(sourceWithCursor: string, newName: string) {
  const offset = sourceWithCursor.lastIndexOf("|");
  const source = sourceWithCursor.slice(0, offset) + sourceWithCursor.slice(offset + 1);
  const result = await new EmbeddedJavaScriptService().getRenameEdits(
    "file:///template.html.twig", 1, parseHybridDocument(source), offset, newName
  );
  return { source, result };
}

function applyRename(source: string, ranges: Array<{ start: number; end: number }>, newName: string): string {
  return [...ranges].sort((left, right) => right.start - left.start)
    .reduce((result, range) => result.slice(0, range.start) + newName + result.slice(range.end), source);
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

  it("does not return automatic global suggestions for JavaScript punctuation", async () => {
    const sourceWithCursor = `<script>document.addEventListener('DOMContentLoaded', (|))</script>`;
    const offset = sourceWithCursor.indexOf("|");
    const source = sourceWithCursor.replace("|", "");
    const service = new EmbeddedJavaScriptService();
    const document = parseHybridDocument(source);
    expect(await service.getCompletions("file:///template.html.twig", 1, document, offset, { triggerCharacter: "(" })).toEqual([]);

    const blockSource = `<script>const listener = () => {|}</script>`;
    const blockOffset = blockSource.indexOf("|");
    const withoutCursor = blockSource.replace("|", "");
    expect(await service.getCompletions("file:///block.html.twig", 1, parseHybridDocument(withoutCursor), blockOffset, { triggerCharacter: "{" })).toEqual([]);

    // Manual Ctrl+Space has no trigger character and remains available.
    expect((await service.getCompletions("file:///template.html.twig", 1, document, offset))?.length).toBeGreaterThan(0);
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

  it("maps TypeScript hover and signature help back into embedded scripts", async () => {
    const source = `<script>document.addEventListener("load", () => {});</script>`;
    const service = new EmbeddedJavaScriptService();
    const document = parseHybridDocument(source);
    const hover = await service.getHover("file:///template.html.twig", 1, document, source.indexOf("addEventListener") + 2);
    expect(hover?.contents).toContain("addEventListener");
    expect(hover?.range.start).toBeGreaterThan(source.indexOf("<script>"));
    const signatureOffset = source.indexOf("\"load\"") + 1;
    const signature = await service.getSignatureHelp("file:///template.html.twig", 1, document, signatureOffset);
    expect(signature?.label).toContain("addEventListener");
    expect(signature?.parameters.length).toBeGreaterThan(0);
  });

  it("maps local JavaScript definitions back to their Twig source ranges", async () => {
    const variable = await definition(`<script>const total = 1; console.log(tot|al);</script>`);
    expect(variable.result?.range).toEqual({
      start: variable.source.indexOf("total"),
      end: variable.source.indexOf("total") + "total".length
    });

    const callable = await definition(`<script>function render(value) { return value; } ren|der(total);</script>`);
    expect(callable.result?.range).toEqual({
      start: callable.source.indexOf("render"),
      end: callable.source.indexOf("render") + "render".length
    });
  });

  it("keeps embedded definition mapping inside one supported script", async () => {
    const moduleAlias = await definition(`<script type="module">import { helper as localHelper } from "./helper.js"; localHel|per();</script>`);
    const declarationStart = moduleAlias.source.indexOf("localHelper");
    expect(moduleAlias.result?.range).toEqual({ start: declarationStart, end: declarationStart + "localHelper".length });

    expect((await definition(`<script>const local = 1;</script><script>console.log(loc|al);</script>`)).result).toBeNull();
    expect((await definition(`<script>docu|ment.body</script>`)).result).toBeNull();
    expect((await definition(`<script type="application/json">{"value":"loc|al"}</script>`)).result).toBeNull();
    expect((await definition(`<script>{{ loc|al }}</script>`)).result).toBeNull();
  });

  it("prepares and maps all local JavaScript rename edits", async () => {
    const prepared = await prepareRename(`<script>const total = 1; console.log(tot|al);</script>`);
    expect(prepared.result).toEqual({
      start: prepared.source.lastIndexOf("total"),
      end: prepared.source.lastIndexOf("total") + "total".length
    });
    const renamed = await rename(`<script>const total = 1; console.log(tot|al);</script>`, "sum");
    expect(renamed.result).toHaveLength(2);
    expect(applyRename(renamed.source, renamed.result ?? [], "sum"))
      .toBe(`<script>const sum = 1; console.log(sum);</script>`);

    const alias = await rename(
      `<script type="module">import { helper as localHelper } from "./helper.js"; localHel|per();</script>`,
      "$helper"
    );
    expect(applyRename(alias.source, alias.result ?? [], "$helper"))
      .toBe(`<script type="module">import { helper as $helper } from "./helper.js"; $helper();</script>`);
  });

  it("rejects invalid, colliding, external, generated, and cross-script renames", async () => {
    const collision = `<script>const first = 1; const second = 2; console.log(fir|st);</script>`;
    expect((await rename(collision, "second")).result).toBeNull();
    expect((await rename(collision, "class")).result).toBeNull();
    expect((await rename(collision, "two words")).result).toBeNull();
    expect((await rename(`<script>docu|ment.body</script>`, "pageDocument")).result).toBeNull();
    expect((await rename(`<script>{{ loc|al }}</script>`, "renamed")).result).toBeNull();
    expect((await rename(`<script>const local = 1;</script><script>console.log(loc|al);</script>`, "renamed")).result).toBeNull();
  });

  it("allows the same new name in a separate JavaScript scope", async () => {
    const scoped = await rename(
      `<script>function one() { const value = 1; return value; } function two() { const target = 2; return tar|get; }</script>`,
      "value"
    );
    expect(scoped.result).toHaveLength(2);
    expect(applyRename(scoped.source, scoped.result ?? [], "value"))
      .toContain(`function two() { const value = 2; return value; }`);
  });
});
