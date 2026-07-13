import { describe, expect, it } from "vitest";
import { getTwigCallable, getTwigTag, TWIG_3_SPEC } from "../src";

describe("Twig 3 language specification", () => {
  it("has unique facts and matching block pairs", () => {
    for (const kind of ["tag", "filter", "function", "test"] as const) {
      const names = kind === "tag" ? TWIG_3_SPEC.tags.map((entry) => entry.name)
        : TWIG_3_SPEC.callables.filter((entry) => entry.kind === kind).map((entry) => entry.name);
      expect(new Set(names).size).toBe(names.length);
    }
    for (const tag of TWIG_3_SPEC.tags.filter((entry) => entry.closing)) {
      expect(getTwigTag(tag.closing!)?.opens).toBe(tag.name);
    }
  });

  it("models undefined-safe Twig constructs", () => {
    expect(getTwigCallable("test", "defined")?.allowsUndefinedInput).toBe(true);
    expect(getTwigCallable("filter", "default")?.allowsUndefinedInput).toBe(true);
  });
});
