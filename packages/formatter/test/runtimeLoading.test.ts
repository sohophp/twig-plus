import { describe, expect, it, vi } from "vitest";

describe("embedded formatter runtime loading", () => {
  it("does not load Prettier for pure Twig and HTML", async () => {
    vi.resetModules();
    const formatter = await import("../src");
    const embedded = await import("../src/embeddedFormatters");
    expect(embedded.isEmbeddedFormatterRuntimeLoaded()).toBe(false);
    const options = {
      profile: "phpstorm", indentSize: 4, printWidth: 100, useTabs: false,
      twigTagSpacing: true, htmlAttributeWrap: "auto", preserveSingleLineBlocks: true,
      lineBreakAfterTwigControlTag: true
    } as const;
    const pureStarted = performance.now();
    await formatter.formatTwig("{% if user %}<div>{{ user }}</div>{% endif %}", options);
    expect(performance.now() - pureStarted).toBeLessThan(500);
    expect(embedded.isEmbeddedFormatterRuntimeLoaded()).toBe(false);
    const embeddedStarted = performance.now();
    await formatter.formatTwig("<script>document.addEventListener('load', () => {});</script>", options);
    expect(performance.now() - embeddedStarted).toBeLessThan(1000);
    expect(embedded.isEmbeddedFormatterRuntimeLoaded()).toBe(true);
  });
});
