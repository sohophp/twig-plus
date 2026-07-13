import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getTwigTag } from "@twig-plus/language-spec";
import {
  parseHybridDocument,
  reconstructHybridDocument,
  validateHybridDocument
} from "../src/hybridAst";

interface ConformanceCase {
  id: string;
  feature: string;
  valid: boolean;
  source: string;
}

const corpus = JSON.parse(readFileSync(
  path.resolve(process.cwd(), "../../tools/upstream-oracle/conformance.json"),
  "utf8"
)) as { schemaVersion: number; cases: ConformanceCase[] };

describe("Twig 3.28 upstream conformance corpus", () => {
  it.each(corpus.cases.filter((entry) => entry.valid))(
    "accepts the official-parser-positive case $id",
    (entry) => {
      const document = parseHybridDocument(entry.source);
      expect(reconstructHybridDocument(document)).toBe(entry.source);
      expect(validateHybridDocument(document)).toEqual([]);

      if (entry.feature.startsWith("tag:")) {
        const tag = getTwigTag(entry.feature.slice(4));
        expect(tag, entry.id).toBeDefined();
        if (tag?.closing) {
          expect(document.twigControlBlocks.some((pair) => pair.name === tag.name), entry.id).toBe(true);
        }
      }
    }
  );

  it.each(corpus.cases.filter((entry) => !entry.valid))(
    "recovers losslessly from the official-parser-negative case $id",
    (entry) => {
      const document = parseHybridDocument(entry.source);
      expect(reconstructHybridDocument(document)).toBe(entry.source);
      expect(validateHybridDocument(document)).toEqual([]);
    }
  );

  it("does not invent removed empty branches or a block form of types", () => {
    const empty = parseHybridDocument("{% for item in items %}{% empty %}{% endfor %}");
    expect(empty.structure[0]?.branches).toEqual([]);
    const types = parseHybridDocument("{% types {user: 'User'} %}{% endtypes %}");
    expect(types.twigControlBlocks.some((pair) => pair.name === "types")).toBe(false);
  });
});
