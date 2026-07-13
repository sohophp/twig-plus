import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("language configuration", () => {
  it("defines onEnter indentation rules for paired twig control tags", () => {
    const config = readLanguageConfiguration();

    const rule = (config.onEnterRules as Array<{ beforeText: string; afterText?: string; action: { indent: string } }>).find((item) => item.action.indent === "indentOutdent" && item.beforeText.includes("\\{%"));
    expect(rule).toBeDefined();
    expect(new RegExp(rule!.beforeText).test("{% if user %}")).toBe(true);
    expect(new RegExp(rule!.afterText!).test("{% endif %}")).toBe(true);
  });

  it("defines onEnter indentation for paired non-void HTML tags", () => {
    const config = readLanguageConfiguration();

    expect(config.onEnterRules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          beforeText: expect.stringContaining("<(?!(?:area|base|br"),
          afterText: expect.stringContaining("</[A-Za-z]"),
          action: {
            indent: "indentOutdent"
          }
        })
      ])
    );
  });

  it("defines indentation rules for twig middle and closing tags", () => {
    const config = readLanguageConfiguration();

    const rules = config.indentationRules as { increaseIndentPattern: string; decreaseIndentPattern: string };
    expect(new RegExp(rules.increaseIndentPattern).test("{% if user %}")).toBe(true);
    expect(new RegExp(rules.increaseIndentPattern).test("{% else %}")).toBe(true);
    expect(new RegExp(rules.decreaseIndentPattern).test("{% endif %}")).toBe(true);
  });

  it("auto closes and surrounds JavaScript callback parentheses", () => {
    const config = readLanguageConfiguration() as { autoClosingPairs: unknown[]; surroundingPairs: unknown[] };
    expect(config.autoClosingPairs).toContainEqual({ open: "(", close: ")" });
    expect(config.surroundingPairs).toContainEqual(["(", ")"]);
  });

  it("does not intercept Enter while completion UI is active", () => {
    const manifestPath = path.join(__dirname, "..", "package.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      contributes: { keybindings: Array<{ command: string; when: string }> };
    };
    const binding = manifest.contributes.keybindings.find((item) => item.command === "twigPlus.insertLineBreak");
    expect(binding?.when).toContain("!suggestWidgetVisible");
    expect(binding?.when).toContain("!inlineSuggestionVisible");
    expect(binding?.when).toContain("!renameInputVisible");
  });

  it("exposes independently configurable stable auto-closing features", () => {
    const manifestPath = path.join(__dirname, "..", "package.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      contributes: {
        configuration: { properties: Record<string, { default: boolean }> };
        keybindings: Array<{ command: string; key: string; when: string }>;
      };
    };
    const properties = manifest.contributes.configuration.properties;
    expect(properties["twigPlus.editing.autoCloseHtmlTags"].default).toBe(true);
    expect((properties["twigPlus.editing.htmlTagClosing"] as unknown as { default: string }).default).toBe("onType");
    expect((properties["twigPlus.diagnostics.unresolvedNameMode"] as unknown as { default: string }).default).toBe("safe");
    expect((properties["twigPlus.symfony.reference"] as unknown as { default: string }).default).toBe("auto");
    expect(properties["twigPlus.editing.autoCloseTwigTags"].default).toBe(true);
    expect(properties["twigPlus.editing.autoCloseCssBraces"].default).toBe(true);
    expect(properties["twigPlus.editing.autoCloseJavaScriptBraces"].default).toBe(true);
    expect(properties["twigPlus.editing.linkedHtmlTags"].default).toBe(true);
    expect(manifest.contributes.keybindings.some((item) => [
      "twigPlus.insertHtmlCloseTag", "twigPlus.insertJavaScriptBracePair", "twigPlus.deleteJavaScriptBracePair"
    ].includes(item.command))).toBe(false);
    expect(manifest.contributes.configurationDefaults?.["[twig]"]?.["editor.linkedEditing"]).toBe(true);
    expect(manifest.contributes.keybindings).toContainEqual(expect.objectContaining({
      command: "twigPlus.typeHtmlTagEnd", key: "shift+.", when: expect.stringContaining("!editorHasMultipleSelections")
    }));
  });
});

function readLanguageConfiguration(): Record<string, unknown> {
  const configPath = path.join(__dirname, "..", "language-configuration.json");
  return JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
}
