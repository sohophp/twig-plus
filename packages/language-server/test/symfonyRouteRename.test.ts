import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { collectSymfonyRouteRenameEdits } from "../src/symfonyRouteRename";

describe("Symfony route rename bridge", () => {
  const roots: string[] = [];
  afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

  it("returns every exact path/url route reference and honors open snapshots", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "twig-plus-route-rename-")); roots.push(root);
    await mkdir(path.join(root, "templates"));
    const first = path.join(root, "templates", "first.html.twig");
    const second = path.join(root, "templates", "second.html.twig");
    await writeFile(first, "{{ path('admin.home') }} {{ asset('admin.home') }}");
    await writeFile(second, "{{ url('admin.old') }}");
    const open = new Map([[pathToFileURL(second).toString(), "{{ url('admin.home') }}"]]);
    const result = await collectSymfonyRouteRenameEdits(root, "admin.home", open);
    expect(result.complete).toBe(true);
    expect(result.edits.map((edit) => [path.basename(new URL(edit.uri).pathname), edit.start, edit.end])).toEqual([
      ["first.html.twig", 9, 19], ["second.html.twig", 8, 18]
    ]);
  });

  it("refuses an incomplete bounded scan", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "twig-plus-route-rename-limit-")); roots.push(root);
    await writeFile(path.join(root, "one.twig"), "{{ path('admin.home') }}");
    expect(await collectSymfonyRouteRenameEdits(root, "admin.home", new Map(), () => false, { maxFiles: 0, maxFileBytes: 100 }))
      .toEqual({ complete: false, edits: [] });
  });

  it("uses the caller's remote URI mapping", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "twig-plus-route-rename-remote-")); roots.push(root);
    await writeFile(path.join(root, "one.twig"), "{{ path('admin.home') }}");
    const result = await collectSymfonyRouteRenameEdits(root, "admin.home", new Map(), () => false,
      { maxFiles: 20, maxFileBytes: 1000 }, (file) => `vscode-remote://wsl/test/${path.relative(root, file)}`);
    expect(result).toMatchObject({ complete: true, edits: [{ uri: "vscode-remote://wsl/test/one.twig" }] });
  });
});
