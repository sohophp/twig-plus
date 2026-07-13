import { describe, expect, it } from "vitest";
import { performance } from "node:perf_hooks";
import { createDocumentModel, parseDocument } from "../src";

describe("parser performance budget", () => {
  it("parses typical and large documents within the editor budget", () => {
    const component = `{% block card %}<article class="{{ theme }}">{% for item in items %}<h2>{{ item.title|default('Untitled') }}</h2>{% endfor %}</article>{% endblock %}\n`;
    const typical = component.repeat(20);
    const large = component.repeat(250);
    // Warm up JIT before recording medians.
    parseDocument(typical);
    const typicalMs = median(Array.from({ length: 9 }, () => timed(() => createDocumentModel(parseDocument(typical)))));
    const largeMs = median(Array.from({ length: 5 }, () => timed(() => parseDocument(large))));
    expect(typicalMs).toBeLessThan(20);
    expect(largeMs).toBeLessThan(100);
  });
});

function timed(run: () => unknown): number {
  const start = performance.now(); run(); return performance.now() - start;
}
function median(values: number[]): number { return values.sort((a, b) => a - b)[Math.floor(values.length / 2)]; }
