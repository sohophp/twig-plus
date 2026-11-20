import { afterEach, describe, expect, it } from "vitest";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ProtocolClient } from "../helpers/protocolClient";

let child: ChildProcessWithoutNullStreams | undefined;
let directory: string | undefined;
afterEach(async () => {
  child?.kill();
  if (directory) await rm(directory, { recursive: true, force: true });
});
const uriFor = (file: string) => pathToFileURL(file).toString();
function contextPayload(root: string, entries: Array<[string, string]>) {
  const projectId = uriFor(root);
  return {
    hello: { protocolVersion: 1, providerId: "php-companion", projectId, snapshotVersion: "1", capabilities: ["controller-contexts", "php-symbols"] },
    contexts: entries.map(([template, name]) => ({ template, complete: true, variables: [{ name, type: { kind: "primitive", name: "string" },
      sources: [{ uri: uriFor(path.join(root, "Controller.php")), start: 100, end: 100 + name.length, line: 4, character: 10 }] }], sources: [] })),
    types: {}
  };
}
async function config(root: string, lines: string[]) {
  await mkdir(path.join(root, "config/packages"), { recursive: true });
  await writeFile(path.join(root, "config/packages/twig.yaml"), "twig:\n  paths:\n" + lines.map((line) => "    " + line).join("\n") + "\n");
}
async function template(root: string, relative: string) {
  const file = path.join(root, relative);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, "{{ person }} {{ customer }} {{ item }} {{ spaced }}");
  return file;
}

describe("namespaced PHP contexts in the bundled Twig server", () => {
  it("isolates roots and follows override, watcher, payload and configuration changes", async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "twig-context-namespaces-"));
    const one = path.join(directory, "one"), two = path.join(directory, "two"), nested = path.join(one, "nested");
    const preferred = await template(one, "templates/preferred/page.html.twig");
    const fallback = await template(one, "templates/site/page.html.twig");
    const foreign = await template(one, "templates/foreign/page.html.twig");
    const spaced = await template(one, "templates/preferred/my page.html.twig");
    const secondary = await template(two, "views/secondary/page.html.twig");
    const catalog = await template(two, "views/foreign/page.html.twig");
    const nestedFile = await template(nested, "templates/preferred/page.html.twig");
    await config(one, ['"%kernel.project_dir%/templates/preferred": site', '"%kernel.project_dir%/templates/site": site']);
    await config(two, ['"%kernel.project_dir%/views/secondary": site', '"%kernel.project_dir%/views/foreign": catalog']);
    await config(nested, ['"%kernel.project_dir%/templates/preferred": site']);
    child = spawn(process.execPath, [path.resolve("packages/vscode/dist/server.js"), "--stdio"], { stdio: "pipe" });
    const client = new ProtocolClient(child);
    await client.request("initialize", { processId: process.pid, rootUri: uriFor(one), capabilities: {},
      workspaceFolders: [one, two, nested].map((root) => ({ uri: uriFor(root), name: path.basename(root) })) });
    client.notify("initialized", {});
    const first = contextPayload(one, [["@site/page.html.twig", "person"], ["@catalog/page.html.twig", "item"], ["@site/my page.html.twig", "spaced"]]);
    client.notify("twigPlus/updatePhpContexts", first);
    client.notify("twigPlus/updatePhpContexts", contextPayload(two, [["@site/page.html.twig", "customer"], ["@catalog/page.html.twig", "item"]]));
    // Use a template definition request as the workspace-ready protocol barrier.
    const open = new Set<string>();
    const definition = async (file: string, name: string) => {
      const uri = uriFor(file), text = "{{ person }} {{ customer }} {{ item }} {{ spaced }}";
      if (!open.has(uri)) { open.add(uri); client.notify("textDocument/didOpen", { textDocument: { uri, languageId: "twig", version: 1, text } }); }
      const response = await client.request("textDocument/definition", { textDocument: { uri }, position: { line: 0, character: text.indexOf(name) + 2 } });
      expect(response.error).toBeUndefined();
      return response.result == null ? [] : Array.isArray(response.result) ? response.result : [response.result];
    };
    const expected = (root: string, name: string) => [{ uri: uriFor(path.join(root, "Controller.php")),
      range: { start: { line: 4, character: 10 }, end: { line: 4, character: 10 + name.length } } }];
    expect(await definition(preferred, "person")).toEqual(expected(one, "person"));
    expect(await definition(fallback, "person")).toEqual([]);
    expect(await definition(foreign, "item")).toEqual([]);
    expect(await definition(secondary, "customer")).toEqual(expected(two, "customer"));
    expect(await definition(catalog, "item")).toEqual(expected(two, "item"));
    expect(await definition(nestedFile, "person")).toEqual([]);
    expect(await definition(spaced, "spaced")).toEqual(expected(one, "spaced"));

    await config(one, ['"%kernel.project_dir%/templates/site": site', '"%kernel.project_dir%/templates/preferred": site']);
    client.notify("workspace/didChangeWatchedFiles", { changes: [{ uri: uriFor(path.join(one, "config/packages/twig.yaml")), type: 2 }] });
    expect(await definition(fallback, "person")).toEqual(expected(one, "person"));
    expect(await definition(preferred, "person")).toEqual([]);
    expect(await definition(secondary, "customer")).toEqual(expected(two, "customer"));

    // A deleted file must be closed; an open buffer intentionally remains indexed.
    client.notify("textDocument/didClose", { textDocument: { uri: uriFor(fallback) } }); open.delete(uriFor(fallback));
    await unlink(fallback);
    client.notify("workspace/didChangeWatchedFiles", { changes: [{ uri: uriFor(fallback), type: 3 }] });
    expect(await definition(preferred, "person")).toEqual(expected(one, "person"));
    await template(one, "templates/site/page.html.twig");
    client.notify("workspace/didChangeWatchedFiles", { changes: [{ uri: uriFor(fallback), type: 1 }] });
    expect(await definition(preferred, "person")).toEqual([]);
    expect(await definition(fallback, "person")).toEqual(expected(one, "person"));

    // Namespace directories outside the default roots remain watched after refresh.
    client.notify("textDocument/didClose", { textDocument: { uri: uriFor(secondary) } }); open.delete(uriFor(secondary));
    client.notify("workspace/didChangeWatchedFiles", { changes: [{ uri: uriFor(secondary), type: 2 }] });
    expect(await definition(secondary, "customer")).toEqual(expected(two, "customer"));
    client.notify("twigPlus/updatePhpContexts", contextPayload(two, []));
    expect(await definition(secondary, "customer")).toEqual([]);
    expect(await definition(fallback, "person")).toEqual(expected(one, "person"));
    client.notify("workspace/didChangeConfiguration", { settings: { twigPlus: { templates: { roots: ["templates"] } } } });
    expect(await definition(fallback, "person")).toEqual(expected(one, "person"));
  }, 15_000);
});
