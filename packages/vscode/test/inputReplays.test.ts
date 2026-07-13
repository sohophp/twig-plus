import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const replay = JSON.parse(readFileSync(path.join(__dirname, "input-replays.json"), "utf8")) as {
  schemaVersion: number;
  scenarios: Array<{ id: string; extensionHostTest?: string; integrationTest?: string; initialText: string; selections: unknown[]; actions: Array<{ type: string }>; checkpoints: unknown[] }>;
};

describe("input replay manifest", () => {
  it("has unique, executable scenarios with checkpoints", () => {
    expect(replay.schemaVersion).toBe(1);
    expect(new Set(replay.scenarios.map((scenario) => scenario.id)).size).toBe(replay.scenarios.length);
    for (const scenario of replay.scenarios) {
      expect(scenario.extensionHostTest || scenario.integrationTest, scenario.id).toBeTruthy();
      expect(scenario.selections.length, scenario.id).toBeGreaterThan(0);
      expect(scenario.actions.length, scenario.id).toBeGreaterThan(0);
      expect(scenario.checkpoints.length, scenario.id).toBeGreaterThan(0);
    }
  });

  it("covers typing, completion, command, IME, undo, and redo actions", () => {
    const actions = new Set(replay.scenarios.flatMap((scenario) => scenario.actions.map((action) => action.type)));
    expect(actions).toEqual(new Set(["type", "acceptCompletion", "command", "imeCommit", "undo", "redo"]));
  });
});
