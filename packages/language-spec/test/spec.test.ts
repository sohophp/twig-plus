import { describe, expect, it } from "vitest";
import { getTwigCallable, getTwigTag, selectTwigSpec, TWIG_3_SPEC } from "../src";

describe("Twig 3 language specification", () => {
  it("is pinned to the audited Twig 3.28 and Symfony 8.1 sources", () => {
    expect(TWIG_3_SPEC).toMatchObject({
      schemaVersion: 2,
      documentedVersion: "3.28.0",
      upstream: {
        twig: { tag: "v3.28.0", commit: "762a989bf2f1a54939fa7da33065beba4ee46e3d" },
        symfony: { tag: "v8.1.1", commit: "12cba50951f46635e6a692c66aa5d8ed7a189302" }
      }
    });
  });

  it("has unique facts and matching block pairs", () => {
    for (const kind of ["tag", "filter", "function", "test"] as const) {
      const names = kind === "tag" ? TWIG_3_SPEC.tags.map((entry) => entry.name)
        : TWIG_3_SPEC.callables.filter((entry) => entry.kind === kind).map((entry) => entry.name);
      expect(new Set(names).size).toBe(names.length);
    }
    for (const tag of selectTwigSpec().tags.filter((entry) => entry.closing)) {
      expect(getTwigTag(tag.closing!)?.opens).toBe(tag.name);
    }
  });

  it("does not expose removed Twig 2 control tags to Twig 3 editor features", () => {
    expect(getTwigTag("filter")).toBeUndefined();
    expect(getTwigTag("spaceless")).toBeUndefined();
    expect(getTwigTag("empty")).toBeUndefined();
    expect(getTwigTag("empty", "2.99")).toMatchObject({ form: "branch", opens: "for" });
  });

  it("models Twig 3.28 types and guard structures from the upstream parser", () => {
    expect(getTwigTag("types")).toMatchObject({ form: "inline" });
    expect(getTwigTag("guard")).toMatchObject({ closing: "endguard", branches: ["else"] });
    expect(getTwigTag("endtypes")).toBeUndefined();
  });

  it("models undefined-safe Twig constructs", () => {
    expect(getTwigCallable("test", "defined")?.allowsUndefinedInput).toBe(true);
    expect(getTwigCallable("filter", "default")?.allowsUndefinedInput).toBe(true);
  });
});
