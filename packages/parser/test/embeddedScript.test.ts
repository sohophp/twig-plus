import { describe, expect, it } from "vitest";
import { createEmbeddedScriptDocuments, parseHybridDocument } from "../src";

describe("createEmbeddedScriptDocuments", () => {
  it("extracts JavaScript and module script bodies", () => {
    const source = `<script>console.log(1)</script><script type="module">export const value = 1</script>`;
    const scripts = createEmbeddedScriptDocuments(parseHybridDocument(source));
    expect(scripts.map((script) => script.kind)).toEqual(["javascript", "javascript-module"]);
    expect(scripts.map((script) => script.generatedSource)).toEqual(["console.log(1)", "export const value = 1"]);
  });

  it("accepts JavaScript MIME types and skips data scripts", () => {
    const source = `<script type="text/javascript">a()</script><script type="application/javascript">b()</script>` +
      `<script type="application/json">{}</script><script type="importmap">{}</script>`;
    expect(createEmbeddedScriptDocuments(parseHybridDocument(source)).map((script) => script.generatedSource)).toEqual(["a()", "b()"]);
  });

  it("keeps completion available while a script is incomplete", () => {
    const source = `<script>const page = { title: "Home" }; page.ti`;
    const script = createEmbeddedScriptDocuments(parseHybridDocument(source))[0];
    expect(script.generatedSource).toBe(`const page = { title: "Home" }; page.ti`);
    expect(script.sourceRange.end).toBe(source.length);
  });

  it("masks Twig constructs while preserving length, lines, and safe mappings", () => {
    const source = `<script>const value = {{ value|json_encode }};\n{% if enabled %}console.lo{% endif %}</script>`;
    const script = createEmbeddedScriptDocuments(parseHybridDocument(source))[0];
    expect(script.generatedSource).toHaveLength(script.sourceRange.end - script.sourceRange.start);
    expect(script.generatedSource).toContain("const value = undefined");
    expect(script.generatedSource).toContain("console.lo");
    const consoleStart = source.indexOf("console");
    expect(script.toGeneratedOffset(consoleStart)).toBe(consoleStart - script.sourceRange.start);
    expect(script.toOriginalRange(consoleStart - script.sourceRange.start, consoleStart + 7 - script.sourceRange.start))
      .toEqual({ start: consoleStart, end: consoleStart + 7 });
    const twigStart = source.indexOf("{{");
    expect(script.toOriginalRange(twigStart - script.sourceRange.start, twigStart + 2 - script.sourceRange.start)).toBeNull();
  });
});
