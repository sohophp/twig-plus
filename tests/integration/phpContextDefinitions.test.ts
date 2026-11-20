import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProtocolClient } from "../helpers/protocolClient";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

let child: ChildProcessWithoutNullStreams;
let root: string;
let client: ProtocolClient;
let uri: string;
let rootUri: string;
let controllerUri: string;
let userUri: string;
let version: number;
const controller = `<?php
final class Controller {
  public function show($person) {
    return $this->render('page.html.twig', ['person' => $person]);
  }
}
`;
const user = `<?php
final class User {
  public function getName(): string { return 'Ada'; }
}
`;
const positionAt = (text: string, offset: number) => {
  const lines = text.slice(0, offset).split("\n");
  return { line: lines.length - 1, character: lines.at(-1)!.length };
};
const location = (uri: string, text: string, start: number, length: number) => ({
  uri, range: { start: positionAt(text, start), end: positionAt(text, start + length) }
});
const sourceLocation = (uri: string, text: string, start: number, length: number) => ({
  uri, start, end: start + length, ...positionAt(text, start), snapshotVersion: "1"
});
function payload(sources = [sourceLocation(controllerUri, controller, controller.indexOf("'person'") + 1, 6)]) {
  return {
    hello: { protocolVersion: 1, providerId: "php-companion", projectId: rootUri, snapshotVersion: "1", capabilities: ["controller-contexts", "php-symbols"] },
    contexts: [{ template: "page.html.twig", complete: true,
      variables: [{ name: "person", type: { kind: "named", name: "App\\User" }, sources }],
      sources: [{ symbol: "Controller::show", location: sourceLocation(controllerUri, controller, controller.indexOf("show"), 4) }] }],
    types: { "App\\User": { name: "App\\User", members: [{ name: "name", kind: "property",
      type: { kind: "primitive", name: "string" }, location: sourceLocation(userUri, user, user.indexOf("getName"), 7) },
      { name: "getName", kind: "method", type: { kind: "primitive", name: "string" },
        location: sourceLocation(userUri, user, user.indexOf("getName"), 7) }] } }
  };
}
async function definitions(text: string, offset = text.lastIndexOf("person") + 2) {
  client.notify("textDocument/didChange", { textDocument: { uri, version: ++version }, contentChanges: [{ text }] });
  const response = await client.request("textDocument/definition", { textDocument: { uri }, position: positionAt(text, offset) });
  expect(response.error).toBeUndefined();
  return response.result == null ? [] : Array.isArray(response.result) ? response.result : [response.result];
}

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "twig-php-definitions-"));
  await mkdir(path.join(root, "templates"));
  await writeFile(path.join(root, "templates/page.html.twig"), "{{ person.name }}");
  await writeFile(path.join(root, "Controller.php"), controller);
  await writeFile(path.join(root, "User.php"), user);
  rootUri = pathToFileURL(root).toString();
  uri = pathToFileURL(path.join(root, "templates/page.html.twig")).toString();
  controllerUri = pathToFileURL(path.join(root, "Controller.php")).toString();
  userUri = pathToFileURL(path.join(root, "User.php")).toString();
  child = spawn(process.execPath, [path.resolve("packages/vscode/dist/server.js"), "--stdio"], { stdio: "pipe" });
  client = new ProtocolClient(child);
  const initialized = await client.request("initialize", { processId: process.pid, rootUri, capabilities: {}, workspaceFolders: [{ uri: rootUri, name: "fixture" }] });
  expect(initialized.error).toBeUndefined();
  client.notify("initialized", {});
  client.notify("twigPlus/updatePhpContexts", payload());
  version = 1;
  client.notify("textDocument/didOpen", { textDocument: { uri, languageId: "twig", version, text: "{{ person.name }}" } });
});
afterEach(async () => {
  child?.kill();
  if (root) await rm(root, { recursive: true, force: true });
});

describe("PHP context definition provenance", () => {
  it("uses the exact render array key instead of the Controller method", async () => {
    expect(await definitions("{{ person }}")).toEqual([
      location(controllerUri, controller, controller.indexOf("'person'") + 1, 6)
    ]);
  });
  it("retains the getter declaration range for Twig property access", async () => {
    const text = "{{ person.name }}";
    expect(await definitions(text, text.indexOf("name") + 2)).toEqual([
      location(userUri, user, user.indexOf("getName"), 7)
    ]);
  });
  it("retains method call definitions when the AST marks a qualified function call", async () => {
    const text = "{{ person.getName() }}";
    expect(await definitions(text, text.indexOf("getName") + 2)).toEqual([
      location(userUri, user, user.indexOf("getName"), 7)
    ]);
  });
  it("returns every render variable source with its own exact range", async () => {
    const other = `<?php\nreturn $view->render('page.html.twig', ['person' => $actor]);\n`;
    const otherUri = pathToFileURL(path.join(root, "Other.php")).toString();
    await writeFile(path.join(root, "Other.php"), other);
    client.notify("twigPlus/updatePhpContexts", payload([
      sourceLocation(controllerUri, controller, controller.indexOf("'person'") + 1, 6),
      sourceLocation(otherUri, other, other.indexOf("'person'") + 1, 6)
    ]));
    expect(await definitions("{{ person }}")).toEqual([
      location(controllerUri, controller, controller.indexOf("'person'") + 1, 6),
      location(otherUri, other, other.indexOf("'person'") + 1, 6)
    ]);
  });
  it("preserves Controller fallback when legacy metadata has no variable sources", async () => {
    client.notify("twigPlus/updatePhpContexts", payload([]));
    const methodPosition = positionAt(controller, controller.indexOf("show"));
    expect(await definitions("{{ person }}")).toEqual([{
      uri: controllerUri, range: { start: { line: methodPosition.line, character: 0 }, end: { line: methodPosition.line, character: 0 } }
    }]);
  });
  it("keeps local Twig definitions ahead of PHP context variables", async () => {
    const text = '{% set person = "local" %}{{ person }}';
    expect(await definitions(text)).toEqual([location(uri, text, text.indexOf("person"), 6)]);
  });
  it("does not resolve members of a local shadow through the Controller type", async () => {
    const text = '{% set person = {} %}{{ person.name }}';
    expect(await definitions(text, text.indexOf("name") + 2)).toEqual([]);
  });
  it.each([
    ["unknown receiver", "{{ unknown.person }}", "person"],
    ["string", '{{ "person" }}', "person"],
    ["comment", "{# person #}", "person"],
    ["HTML text", "<p>person</p>", "person"],
    ["string member", '{{ "person.name" }}', "name"],
    ["comment member", "{# person.name #}", "name"],
    ["HTML member", "<p>person.name</p>", "name"],
    ["hash key", "{{ {'person': 1} }}", "person"],
    ["filter", "{{ value|person }}", "person"],
    ["test", "{{ value is person }}", "person"],
    ["function", "{{ person() }}", "person"],
    ["named argument", "{{ unknown(person: 1) }}", "person"]
  ])("rejects PHP definition for a %s token", async (_name, text, word) => {
    expect(await definitions(text, text.indexOf(word) + 2)).toEqual([]);
  });
});
