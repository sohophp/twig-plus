import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { collectHybridSelectionRanges, createHtmlVirtualSource, getHtmlContextAtOffset, getHybridCompletionContext, getHybridTokenContextAtOffset, parseHybridDocument, reconstructHybridDocument, validateHybridDocument } from "../src/hybridAst";
import { collectHybridStructureSymbols } from "../src/hybridAst";

describe("parseHybridDocument", () => {
  it("ends Twig comments at #} even when their text contains unmatched quotes", () => {
    const source = `<script>\n{# unmatched " ' quotes #}\n{% if user is defined %}\n{% endif %}\n</script>`;
    const document = parseHybridDocument(source);
    expect(document.children.filter((node) => node.kind === "TwigComment")).toHaveLength(1);
    expect(document.children.filter((node) => node.kind === "TwigTag")).toHaveLength(2);
    expect(validateHybridDocument(document)).toEqual([]);
  });

  it("losslessly parses mixed HTML and Twig and records structural pairs", () => {
    const source = `{% if user %}\n<section class="{{ theme }}">Hello {{ user.name }}</section>\n{% endif %}`;
    const document = parseHybridDocument(source);
    expect(reconstructHybridDocument(document)).toBe(source);
    expect(validateHybridDocument(document)).toEqual([]);
    expect(document.htmlElements.map((pair) => pair.name)).toEqual(["section"]);
    expect(document.twigControlBlocks.map((pair) => pair.name)).toEqual(["if"]);
    const open = document.children.find((node) => node.kind === "HtmlOpenTag");
    expect(open && "embeddedTwig" in open ? open.embeddedTwig : []).toHaveLength(1);
  });

  it.each(["{% bl", "{{ user.", "<div class=\"hero\"", "{% if x %}<b>"])(
    "keeps incomplete input lossless: %s",
    (source) => {
      expect(() => parseHybridDocument(source)).not.toThrow();
      const document = parseHybridDocument(source);
      expect(reconstructHybridDocument(document)).toBe(source);
      expect(validateHybridDocument(document)).toEqual([]);
    }
  );

  it("keeps conditional HTML structures in source order without inventing nesting", () => {
    const source = `{% if wrapped %}<section>{% endif %}content{% if wrapped %}</section>{% endif %}`;
    const document = parseHybridDocument(source);
    expect(document.children.map((node) => node.raw).join("")).toBe(source);
    expect(document.htmlElements).toHaveLength(1);
    expect(document.twigControlBlocks).toHaveLength(2);
  });

  it("builds a containment forest with Twig branches", () => {
    const source = `<main>{% if user %}<p>{{ user }}</p>{% else %}<span>Guest</span>{% endif %}</main>`;
    const document = parseHybridDocument(source);
    const main = document.structure.find((node) => node.kind === "HtmlElement");
    const control = main?.children.find((node) => node.kind === "TwigControlBlock");
    expect(control?.name).toBe("if");
    expect(control?.branches.map((branch) => branch.name)).toEqual(["else"]);
    expect(control?.children.map((node) => node.name)).toEqual(["p", "span"]);
  });

  it("answers editor context and selection queries from the syntax document", () => {
    const source = `{% if user %}<p title="{{ user.name }}">{{ user.name|upper }}</p>{% else %}Guest{% endif %}`;
    const document = parseHybridDocument(source);
    const nameOffset = source.lastIndexOf("user.name") + 2;
    expect(getHybridTokenContextAtOffset(document, nameOffset)).toMatchObject({ kind: "output", stringLike: false });
    expect(getHybridTokenContextAtOffset(document, source.indexOf("user.name") + 2)).toMatchObject({ kind: "output" });
    expect(getHybridCompletionContext(document, source.indexOf("{% else"))).toMatchObject({ topLevelTag: "if", allowedMiddleTags: ["elseif", "else"] });
    const ranges = collectHybridSelectionRanges(document, nameOffset);
    expect(ranges[0]).toMatchObject({ start: source.lastIndexOf("user.name"), end: source.lastIndexOf("user.name") + 4 });
    expect(ranges.at(-1)).toEqual({ start: 0, end: source.length });
  });

  it("does not misclassify Twig tags as HTML tags during editor queries", () => {
    const source = `{% if user %}<div class="">{{ user }}</div>{% endif %}`;
    const document = parseHybridDocument(source);
    expect(() => getHtmlContextAtOffset(document, source.indexOf("user"))).not.toThrow();
    expect(getHtmlContextAtOffset(document, source.indexOf("user"))).toEqual({ kind: "html-text", tagName: null });
    expect(getHtmlContextAtOffset(document, source.indexOf('""') + 1).kind).toBe("attribute-value");
  });

  it("does not interpret JavaScript and CSS less-than expressions as HTML", () => {
    const source = `<script>if (a <buttonCount) { view = "<card>"; } {{ hook }}</script><style>.x { width: calc(2px < 3px); }</style>`;
    const document = parseHybridDocument(source);
    expect(document.htmlElements.map((pair) => pair.name)).toEqual(["script", "style"]);
    expect(document.children.filter((node) => node.kind === "TwigOutput")).toHaveLength(1);
    expect(reconstructHybridDocument(document)).toBe(source);
  });

  it("does not close an HTML tag on operators inside an unquoted Twig attribute branch", () => {
    const source = `<div {% if score > 2 %}class="high"{% endif %}>value</div>`;
    const document = parseHybridDocument(source);
    const open = document.children.find((node) => node.kind === "HtmlOpenTag");
    expect(open?.raw).toBe(`<div {% if score > 2 %}class="high"{% endif %}>`);
    expect(document.htmlElements).toHaveLength(1);
  });

  it("segments conditional, quoted, framework, and incomplete attributes with stable offsets", () => {
    const source = `<svg><use :href="{{ icon }}" {% if active %} aria-label='Icon' data-pending=va`;
    const document = parseHybridDocument(source);
    const open = document.children.find((node) => "tagName" in node && node.tagName === "use");
    expect(open && "attributes" in open ? open.attributes.map((attribute) => attribute.name) : []).toEqual([
      ":href", "aria-label", "data-pending"
    ]);
    expect(open && "attributeSegments" in open
      ? open.attributeSegments.some((segment) => segment.kind === "TwigAttributeSegment")
      : false).toBe(true);
    expect(getHtmlContextAtOffset(document, source.indexOf("Icon") + 1).kind).toBe("attribute-value");
    const virtual = createHtmlVirtualSource(document);
    expect(virtual.length).toBe(source.length);
    expect(virtual.indexOf("aria-label")).toBe(source.indexOf("aria-label"));
    expect(virtual.slice(source.indexOf("{%"), source.indexOf("%}") + 2).trim()).toBe("");
  });

  it("survives deterministic truncation fuzzing", () => {
    const source = `<main>{% block body %}<p class="{{ kind }}">{{ value }}</p>{% endblock %}</main>`;
    for (let end = 0; end <= source.length; end += 1) {
      const fragment = source.slice(0, end);
      const document = parseHybridDocument(fragment);
      expect(reconstructHybridDocument(document)).toBe(fragment);
      expect(validateHybridDocument(document)).toEqual([]);
    }
  });

  it("survives deterministic single-edit mutation fuzzing", () => {
    const seeds = [
      `{% for key, item in items|filter(v => v.active) %}<a href="{{ path('item', {id: item.id}) }}">{{ item.title|default('x') }}</a>{% else %}Empty{% endfor %}`,
      `{% with { user: account.owner } %}{{ render(title: user.name, options: {compact: true}) }}{% endwith %}`
    ];
    const insertions = ["'", '"', "{", "}", "%", "[", "]", "|"];
    for (const seed of seeds) {
      for (let offset = 0; offset <= seed.length; offset += 3) {
        const variants = [seed.slice(0, offset) + seed.slice(offset + 1), ...insertions.map((value) => seed.slice(0, offset) + value + seed.slice(offset))];
        for (const source of variants) {
          const document = parseHybridDocument(source);
          expect(reconstructHybridDocument(document)).toBe(source);
          expect(validateHybridDocument(document)).toEqual([]);
        }
      }
    }
  });

  it("losslessly parses the formatter and example compatibility corpus", () => {
    const workspaceRoot = path.resolve(process.cwd(), "../..");
    const files = [
      ...collectTwigFiles(path.join(workspaceRoot, "examples")),
      ...collectTwigFiles(path.join(workspaceRoot, "packages/formatter/test/fixtures"))
    ];
    expect(files.length).toBeGreaterThan(30);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const document = parseHybridDocument(source);
      expect(validateHybridDocument(document), file).toEqual([]);
      expect(reconstructHybridDocument(document), file).toBe(source);
      expect(collectHybridStructureSymbols(document).every((symbol) => symbol.start >= 0 && symbol.end <= source.length), file).toBe(true);
    }
  });
});

function collectTwigFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectTwigFiles(target);
    return /\.(?:twig|html\.twig)$/.test(entry.name) ? [target] : [];
  });
}
