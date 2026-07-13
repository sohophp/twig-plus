import { describe, expect, it } from "vitest";
import { createDocumentModel, parseDocument, printCst } from "../src";

describe("DocumentModel", () => {
  it("builds lexical symbols and resolves references", () => {
    const source = `{% set theme = "dark" %}{{ theme }}{% for item in items %}{{ item.name }}{{ theme }}{% endfor %}`;
    const document = parseDocument(source);
    const model = createDocumentModel(document, { globals: ["items"], diagnoseUnresolvedNames: true });
    expect(printCst(document)).toBe(source);
    expect(model.symbols.map((symbol) => [symbol.name, symbol.kind])).toEqual([
      ["theme", "variable"], ["item", "variable"]
    ]);
    const theme = model.symbols[0];
    expect(model.findReferences(theme)).toHaveLength(2);
    expect(model.references.some((reference) => reference.name === "items")).toBe(true);
    expect(model.getVisibleSymbolsAt(source.indexOf("item.name")).map((symbol) => symbol.name)).toEqual(["item", "theme"]);
  });

  it("separates statement bindings from right-hand-side references", () => {
    const source = `{% set selected = account.profile %}{% for key, value in records %}{{ selected }}{{ key }}{{ value }}{% endfor %}`;
    const model = createDocumentModel(parseDocument(source));
    expect(model.symbols.map((symbol) => symbol.name)).toEqual(["selected", "key", "value"]);
    expect(model.references.map((reference) => [reference.name, reference.role])).toEqual([
      ["account", "variable-read"], [".", "operator"], ["profile", "member"], ["records", "variable-read"],
      ["selected", "variable-read"], ["key", "variable-read"], ["value", "variable-read"]
    ]);
  });

  it("does not treat named argument labels as variable references", () => {
    const model = createDocumentModel(parseDocument(`{{ render(title: heading) }}`));
    expect(model.references.map((reference) => [reference.name, reference.role])).toEqual([
      ["render", "function-call"], ["title", "named-argument"], ["heading", "variable-read"]
    ]);
  });

  it("models with-map keys as inner lexical bindings", () => {
    const source = `{% with { user: currentUser } %}{{ user.name }}{% endwith %}{{ user }}`;
    const model = createDocumentModel(parseDocument(source), { diagnoseUnresolvedNames: true, globals: ["currentUser"] });
    const inner = source.indexOf("user.name");
    expect(model.getVisibleSymbolsAt(inner).map((symbol) => symbol.name)).toContain("user");
    expect(model.references.map((reference) => [reference.name, reference.role])).toEqual([
      ["currentUser", "variable-read"], ["user", "variable-read"], [".", "operator"], ["name", "member"], ["user", "variable-read"]
    ]);
    expect(model.diagnostics.filter((diagnostic) => diagnostic.code === "unresolved-name")).toHaveLength(1);
  });

  it("does not leak loop bindings into the for-else branch", () => {
    const source = `{% for item in items %}{{ item }}{% else %}{{ item }}{% endfor %}`;
    const model = createDocumentModel(parseDocument(source), { diagnoseUnresolvedNames: true, globals: ["items"] });
    const reads = model.references.filter((reference) => reference.name === "item");
    expect(reads[0].resolvedSymbolId).toBe(model.symbols.find((symbol) => symbol.name === "item")?.id);
    expect(reads[1].resolvedSymbolId).toBeUndefined();
    expect(model.diagnostics.filter((diagnostic) => diagnostic.code === "unresolved-name")).toHaveLength(1);
  });

  it("ignores nested branch markers when delimiting a loop scope", () => {
    const source = `{% for item in items %}{% if item %}{{ item }}{% else %}{{ item }}{% endif %}{{ item }}{% else %}{{ item }}{% endfor %}`;
    const model = createDocumentModel(parseDocument(source), { diagnoseUnresolvedNames: true, globals: ["items"] });
    const reads = model.references.filter((reference) => reference.name === "item");
    expect(reads.slice(0, -1).every((reference) => reference.resolvedSymbolId)).toBe(true);
    expect(reads.at(-1)?.resolvedSymbolId).toBeUndefined();
  });

  it("creates lexical scopes for Twig arrow-function parameters", () => {
    const source = `{{ items|filter(item => item.active and allowed) }}{{ item }}`;
    const model = createDocumentModel(parseDocument(source), { diagnoseUnresolvedNames: true, globals: ["items", "allowed"] });
    const parameter = model.symbols.find((symbol) => symbol.kind === "parameter" && symbol.name === "item");
    const reads = model.references.filter((reference) => reference.name === "item");
    expect(parameter).toBeDefined();
    expect(reads[0].resolvedSymbolId).toBe(parameter?.id);
    expect(reads[1].resolvedSymbolId).toBeUndefined();
  });

  it("keeps dynamic template references distinct and reports duplicate declarations", () => {
    const source = `{% macro value() %}{% endmacro %}{% macro value() %}{% endmacro %}{% include template_name %}`;
    const model = createDocumentModel(parseDocument(source));
    expect(model.references.find((reference) => reference.role === "template")).toMatchObject({ name: "template_name", dynamic: true });
    expect(model.diagnostics.map((diagnostic) => diagnostic.code)).toContain("duplicate-symbol");
  });

  it("resolves variables by declaration order and permits set reassignment", () => {
    const source = `{{ value }}{% set value = first %}{{ value }}{% set value = second %}{{ value }}`;
    const model = createDocumentModel(parseDocument(source), { diagnoseUnresolvedNames: true, globals: ["first", "second"] });
    const declarations = model.symbols.filter((symbol) => symbol.name === "value");
    const reads = model.references.filter((reference) => reference.name === "value");
    expect(declarations).toHaveLength(2);
    expect(reads.map((reference) => reference.resolvedSymbolId)).toEqual([undefined, declarations[0].id, declarations[1].id]);
    expect(model.diagnostics.filter((diagnostic) => diagnostic.code === "duplicate-symbol")).toHaveLength(0);
  });

  it("associates semantic syntax with lossless Twig CST nodes", () => {
    const document = parseDocument(`<p>{{ user.name|upper }}</p>`);
    const output = document.children.find((node) => node.kind === "TwigOutput");
    expect(output && "expression" in output ? output.expression?.kind : null).toBe("FilterExpression");
  });

  it("resolves callable roles and protects undefined-safe inputs", () => {
    const source = `{% if user is defined %}{{ user.name|default('guest') }}{% endif %}`;
    const model = createDocumentModel(parseDocument(source), { unresolvedNameMode: "strict" });
    expect(model.references.map((reference) => [reference.name, reference.role])).toEqual([
      ["user", "variable-read"], ["defined", "test"], ["user", "variable-read"], [".", "operator"], ["name", "member"], ["default", "filter"]
    ]);
    expect(model.references.filter((reference) => reference.name === "user").map((reference) => reference.allowsUndefined)).toEqual([true, true]);
    expect(model.diagnostics.filter((diagnostic) => diagnostic.code === "unresolved-name")).toEqual([]);
  });

  it("keeps undefined protection local to the protected operand", () => {
    const source = `{% if user is defined and user.active %}ok{% endif %}`;
    const model = createDocumentModel(parseDocument(source), { unresolvedNameMode: "strict" });
    expect(model.diagnostics.map((diagnostic) => diagnostic.message)).toEqual(["Unresolved name 'user'."]);
  });

  it("narrows a defined variable throughout the true if branch", () => {
    const source = `{% if user is defined %}<span>{{ user.name }}</span>{% endif %}`;
    const model = createDocumentModel(parseDocument(source), { unresolvedNameMode: "strict" });
    const user = model.symbols.find((symbol) => symbol.name === "user" && symbol.scopeId !== "scope:document");
    expect(user).toBeDefined();
    expect(model.references.find((reference) => reference.name === "user" && reference.start > source.indexOf("<span>"))?.resolvedSymbolId).toBe(user?.id);
    expect(model.diagnostics.filter((diagnostic) => diagnostic.code === "unresolved-name")).toEqual([]);
  });

  it("uses safe diagnostics only with authoritative project context", () => {
    const source = `{{ application_value }}`;
    expect(createDocumentModel(parseDocument(source), { unresolvedNameMode: "safe" }).diagnostics).toEqual([]);
    expect(createDocumentModel(parseDocument(source), { unresolvedNameMode: "safe", contextComplete: true }).diagnostics).toHaveLength(1);
  });

  it("exposes operator references and variables declared by types", () => {
    const source = `{% types {user: 'App\\Model\\User'} %}{{ user?.name ?? 'guest' }}`;
    const model = createDocumentModel(parseDocument(source), { unresolvedNameMode: "strict" });
    expect(model.symbols.map((symbol) => symbol.name)).toEqual(["user"]);
    expect(model.references.filter((reference) => reference.role === "operator").map((reference) => reference.name).sort()).toEqual(["?.", "??"]);
    expect(model.references.find((reference) => reference.name === "user")?.resolvedSymbolId).toBe(model.symbols[0].id);
    expect(model.diagnostics).toEqual([]);
  });
});
