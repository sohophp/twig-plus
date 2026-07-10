import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("language configuration", () => {
  it("defines onEnter indentation rules for paired twig control tags", () => {
    const config = readLanguageConfiguration();

    expect(config.onEnterRules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          beforeText: expect.stringContaining("\\{%\\s*(if|for|block"),
          afterText: expect.stringContaining("\\{%\\s*end(if|for|block"),
          action: {
            indent: "indentOutdent"
          }
        })
      ])
    );
  });

  it("defines indentation rules for twig middle and closing tags", () => {
    const config = readLanguageConfiguration();

    expect(config.indentationRules).toEqual(
      expect.objectContaining({
        increaseIndentPattern: expect.stringContaining("\\{%\\s*(if|for|block"),
        decreaseIndentPattern: expect.stringContaining("\\{%\\s*end(if|for|block")
      })
    );
  });
});

function readLanguageConfiguration(): Record<string, unknown> {
  const configPath = path.join(__dirname, "..", "language-configuration.json");
  return JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
}
