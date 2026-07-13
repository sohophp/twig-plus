import { describe, expect, it } from "vitest";
import { getServerCapabilities, MAX_DOCUMENT_LENGTH, MAX_INDEXED_FILES, MAX_INDEXED_FILE_BYTES } from "../src";

describe("TwigPlus language server", () => {
  it("advertises the semantic and editing migration surface", () => {
    expect(getServerCapabilities()).toMatchObject({
      completionProvider: expect.any(Object), definitionProvider: true, referencesProvider: true,
      renameProvider: { prepareProvider: true }, documentSymbolProvider: true,
      selectionRangeProvider: true, documentFormattingProvider: true,
      hoverProvider: true, signatureHelpProvider: expect.any(Object), documentRangeFormattingProvider: true
    });
    expect(getServerCapabilities().completionProvider).toMatchObject({
      triggerCharacters: expect.arrayContaining(["%", "{", " "])
    });
  });

  it("defines bounded production resource budgets", () => {
    expect(MAX_DOCUMENT_LENGTH).toBeGreaterThanOrEqual(1_000_000);
    expect(MAX_INDEXED_FILE_BYTES).toBe(MAX_DOCUMENT_LENGTH);
    expect(MAX_INDEXED_FILES).toBeGreaterThanOrEqual(10_000);
  });
});
