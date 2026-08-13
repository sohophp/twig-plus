import { describe, expect, it } from "vitest";
import { parseTwigExtensionGlobals } from "../src/staticTwigGlobals";

describe("static Twig extension globals", () => {
  it("reads literal getGlobals keys without executing PHP", () => {
    const source = `final class Extension implements GlobalsInterface {
      public function getGlobals(): array { $request = lookup(); return [
        'legacyApp' => $this->app, "metaInformation" => value(), 'here' => $request?->getUri() ?? '',
      ]; }
    }`;
    expect(parseTwigExtensionGlobals(source)).toEqual(["legacyApp", "metaInformation", "here"]);
  });

  it("ignores unrelated arrays and extensions without GlobalsInterface", () => {
    expect(parseTwigExtensionGlobals(`class Extension { function getGlobals() { return ['unsafe' => run()]; } }`)).toEqual([]);
    expect(parseTwigExtensionGlobals(`class Extension implements GlobalsInterface { function other() { return ['wrong' => 1]; } }`)).toEqual([]);
  });
});
