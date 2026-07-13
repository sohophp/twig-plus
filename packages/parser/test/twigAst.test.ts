import { describe, expect, it } from "vitest";
import { selectTwigSpec } from "@twig-plus/language-spec";
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

  it("models variables declared by the Twig 3.28 types tag", () => {
    const statement = parseTwigStatement("types {user: 'App\\Model\\User', title?: 'string'}");
    expect(statement.bindings.map((binding) => binding.name)).toEqual(["user", "title"]);
    expect(statement.arguments).toEqual([]);
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

  it("parses current Twig 3 operators, safe navigation, spread and assignment", () => {
    expect(parseTwigExpression(`value === other`).kind).toBe("BinaryExpression");
    expect(parseTwigExpression(`items has every (item => item.active)`)).toMatchObject({ operator: "has every" });
    expect(parseTwigExpression(`user?.profile`)).toMatchObject({ kind: "MemberExpression", optional: true });
    expect(parseTwigExpression(`[...items]`)).toMatchObject({ kind: "ArrayExpression", items: [{ kind: "SpreadExpression" }] });
    expect(parseTwigExpression(`[first, last] = names`)).toMatchObject({ kind: "BinaryExpression", operator: "=" });
  });

  it("parses multi-parameter arrows and ignores Twig 3.15 inline comments", () => {
    const arrow = parseTwigExpression(`items|reduce((carry, item) => carry + item.value, 0)`);
    const parameters: string[][] = [];
    visitTwigExpression(arrow, (node) => { if (node.kind === "ArrowFunctionExpression") parameters.push(node.parameters.map((item) => item.name)); });
    expect(parameters).toEqual([["carry", "item"]]);
    expect(parseTwigExpression("value # explanation\n|upper").complete).toBe(true);
    expect(tokenizeTwig("{{ value # closing delimiter is commented }}")).toMatchObject([{ raw: "{{ value # closing delimiter is commented }}" }]);
  });

  it.each(selectTwigSpec().operators.map((operator) => operator.name))(
    "builds a complete AST for the registered %s operator",
    (operator) => {
      const expression = parseTwigExpression(operatorFixture(operator));
      expect(expression.complete, operator).toBe(true);
      const nodes: Array<{ kind: string; operator?: string; optional?: boolean; negated?: boolean }> = [];
      visitTwigExpression(expression, (node) => nodes.push(node));
      if (operator === ".") expect(nodes).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "MemberExpression", optional: false })]));
      else if (operator === "|") expect(nodes).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "FilterExpression" })]));
      else if (operator === "is" || operator === "is not") expect(nodes).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "TestExpression", negated: operator === "is not" })]));
      else if (operator === "=>") expect(nodes).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "ArrowFunctionExpression" })]));
      else if (operator === "...") expect(nodes).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "SpreadExpression" })]));
      else if (operator === "?") expect(nodes).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "ConditionalExpression" })]));
      else expect(nodes).toEqual(expect.arrayContaining([expect.objectContaining({ operator })]));
    }
  );
});

function operatorFixture(operator: string): string {
  if (operator === ".") return "left.right";
  if (operator === "|") return "left|upper";
  if (operator === "is") return "left is defined";
  if (operator === "is not") return "left is not defined";
  if (operator === "=>") return "item => item.name";
  if (operator === "...") return "[...items]";
  if (operator === "?") return "condition ? yes : no";
  if (operator === "not") return "not condition";
  if (operator === "=") return "[left] = right";
  return `left ${operator} right`;
}
