import { describe, expect, it } from "vitest";
import { getLinkedHtmlTagRanges } from "../src/editing/htmlLinkedEditing";

describe("getLinkedHtmlTagRanges", () => {
  it("links matching opening and closing HTML tag names", () => {
    const source = "<section><h3>Title</h3></section>";
    expect(getLinkedHtmlTagRanges(source, source.indexOf("h3") + 1)).toEqual([
      { start: source.indexOf("h3"), end: source.indexOf("h3") + 2 },
      { start: source.lastIndexOf("h3"), end: source.lastIndexOf("h3") + 2 }
    ]);
    expect(getLinkedHtmlTagRanges(source, source.lastIndexOf("h3") + 1)).not.toBeNull();
  });

  it("does not link void, unpaired, or text positions", () => {
    expect(getLinkedHtmlTagRanges("<br>", 2)).toBeNull();
    expect(getLinkedHtmlTagRanges("<h3>", 2)).toBeNull();
    expect(getLinkedHtmlTagRanges("<h3>Title</h3>", 7)).toBeNull();
  });
});
