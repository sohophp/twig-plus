import { describe, expect, it } from "vitest";
import { TWIG_DOCUMENT_SELECTOR } from "../src/language/documentSelector";

describe("Twig document selector", () => {
  it("targets file and untitled documents without an unscoped selector", () => {
    expect(TWIG_DOCUMENT_SELECTOR).toEqual([
      { language: "twig", scheme: "file" },
      { language: "twig", scheme: "untitled" }
    ]);
  });
});
