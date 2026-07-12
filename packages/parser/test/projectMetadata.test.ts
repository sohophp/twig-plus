import { describe, expect, it } from "vitest";
import { emptyProjectMetadata, type ProjectMetadataProvider } from "../src";

describe("ProjectMetadataProvider", () => {
  it("keeps optional framework metadata independent from generic Twig", async () => {
    const provider: ProjectMetadataProvider = {
      id: "fixture",
      supports: async () => true,
      load: async (projectRoot) => ({
        ...emptyProjectMetadata("fixture", projectRoot),
        completions: [{ kind: "function", name: "project_function" }]
      })
    };
    const snapshot = await provider.load("/workspace");
    expect(snapshot.providerId).toBe("fixture");
    expect(snapshot.completions[0]).toEqual({ kind: "function", name: "project_function" });
  });
});
