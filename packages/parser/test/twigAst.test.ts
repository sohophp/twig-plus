import { describe, expect, it } from "vitest";
import { lexTwig, parseTwigExpression, parseTwigStatement, tokenizeTwig, visitTwigExpression } from "../src";

describe("Twig lexer and expression AST", () => {
  it("keeps delimiter-like text inside strings", () => {
    const tokens = tokenizeTwig(`{{ "not }} closed"|default('x') }}`);
    expect(tokens).toHaveLength(1);
    expect(tokens[0].raw).toBe(`{{ "not }} closed"|default('x') }}`);
  });

  it("preserves trivia and absolute lexeme ranges", () => {
    const tokens = lexTwig(" user.name | upper ", 10);
    expect(tokens.map((token) => token.value)).toEqual([" ", "user", ".", "name", " ", "|", " ", "upper", " ", ""]);
    expect(tokens[1]).toMatchObject({ kind: "name", start: 11, end: 15 });
  });

  it("parses Twig access, calls, filters, tests, maps and operators", () => {
    const expression = parseTwigExpression(`users[0].name|default({fallback: "x"}) is not empty or enabled`);
    const kinds: string[] = [];
    visitTwigExpression(expression, (node) => kinds.push(node.kind));
    expect(kinds).toContain("MemberExpression");
    expect(kinds).toContain("FilterExpression");
    expect(kinds).toContain("MapExpression");
    expect(kinds).toContain("TestExpression");
    expect(expression.kind).toBe("BinaryExpression");
  });

  it.each(["", "user.", "items[", "fn(", `{name: "unfinished`])("recovers from incomplete input: %s", (source) => {
    expect(() => parseTwigExpression(source)).not.toThrow();
    expect(parseTwigExpression(source).complete).toBe(false);
  });

  it("models statement bindings separately from expressions", () => {
    const statement = parseTwigStatement("for key, value in records|slice(0, 5)", 20);
    expect(statement.bindings.map((binding) => [binding.name, binding.role])).toEqual([["key", "variable"], ["value", "variable"]]);
    expect(statement.arguments[0].kind).toBe("FilterExpression");
    expect(statement.arguments[0].start).toBeGreaterThan(20);
  });

  it("parses named arguments and compound Twig operators", () => {
    const expression = parseTwigExpression(`render(title: heading, compact = true) and role not in blocked`);
    const kinds: string[] = [];
    visitTwigExpression(expression, (node) => kinds.push(node.kind));
    expect(kinds.filter((kind) => kind === "NamedArgumentExpression")).toHaveLength(2);
    expect(expression).toMatchObject({ kind: "BinaryExpression", operator: "and", right: { operator: "not in" } });
  });

  it("does not confuse macro default-value names with parameters", () => {
    const statement = parseTwigStatement(`macro card(title, theme = defaultTheme)`);
    expect(statement.bindings.map((binding) => binding.name)).toEqual(["card", "title", "theme"]);
  });

  it("parses Twig arrow functions as first-class expressions", () => {
    const expression = parseTwigExpression(`items|filter(item => item.active)`);
    const kinds: string[] = [];
    visitTwigExpression(expression, (node) => kinds.push(node.kind));
    expect(kinds).toContain("ArrowFunctionExpression");
    expect(expression.complete).toBe(true);
    const parenthesized = parseTwigExpression(`items|filter((item) => item.active)`);
    const arrowKinds: string[] = [];
    visitTwigExpression(parenthesized, (node) => arrowKinds.push(node.kind));
    expect(arrowKinds).toContain("ArrowFunctionExpression");
  });
});
