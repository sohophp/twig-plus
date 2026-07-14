import { lexTwig, type TwigLexeme } from "./twigTokenizer";
import { TWIG_3_SPEC } from "@twig-plus/language-spec";
import type { SourceRange } from "./queryTypes";

export interface TwigAstNodeBase extends SourceRange { kind: string; complete: boolean; }
export interface NameExpression extends TwigAstNodeBase { kind: "NameExpression"; name: string; }
export interface LiteralExpression extends TwigAstNodeBase { kind: "LiteralExpression"; value: string | number | boolean | null; raw: string; }
export interface UnaryExpression extends TwigAstNodeBase { kind: "UnaryExpression"; operator: string; operatorRange: SourceRange; operand: TwigExpression; }
export interface BinaryExpression extends TwigAstNodeBase { kind: "BinaryExpression"; operator: string; operatorRange: SourceRange; left: TwigExpression; right: TwigExpression; }
export interface MemberExpression extends TwigAstNodeBase { kind: "MemberExpression"; object: TwigExpression; property: TwigExpression; computed: boolean; optional?: boolean; operatorRange?: SourceRange; }
export interface CallExpression extends TwigAstNodeBase { kind: "CallExpression"; callee: TwigExpression; arguments: TwigExpression[]; }
export interface FilterExpression extends TwigAstNodeBase { kind: "FilterExpression"; input: TwigExpression; filter: NameExpression; arguments: TwigExpression[]; }
export interface TestExpression extends TwigAstNodeBase { kind: "TestExpression"; input: TwigExpression; test: NameExpression; negated: boolean; arguments: TwigExpression[]; }
export interface CollectionExpression extends TwigAstNodeBase { kind: "ArrayExpression" | "MapExpression"; items: Array<TwigExpression | { key: TwigExpression; value: TwigExpression }>; }
export interface ConditionalExpression extends TwigAstNodeBase { kind: "ConditionalExpression"; test: TwigExpression; consequent: TwigExpression; alternate: TwigExpression; }
export interface NamedArgumentExpression extends TwigAstNodeBase { kind: "NamedArgumentExpression"; name: NameExpression; value: TwigExpression; }
export interface ArrowFunctionExpression extends TwigAstNodeBase { kind: "ArrowFunctionExpression"; parameters: NameExpression[]; body: TwigExpression; }
export interface ParenthesizedExpression extends TwigAstNodeBase { kind: "ParenthesizedExpression"; expression: TwigExpression; }
export interface SpreadExpression extends TwigAstNodeBase { kind: "SpreadExpression"; operatorRange: SourceRange; expression: TwigExpression; }
export interface MissingExpression extends TwigAstNodeBase { kind: "MissingExpression"; expected: string; }
export interface ErrorExpression extends TwigAstNodeBase { kind: "ErrorExpression"; message: string; raw: string; }
export type TwigExpression = NameExpression | LiteralExpression | UnaryExpression | BinaryExpression | MemberExpression | CallExpression | FilterExpression | TestExpression | CollectionExpression | ConditionalExpression | NamedArgumentExpression | ArrowFunctionExpression | ParenthesizedExpression | SpreadExpression | MissingExpression | ErrorExpression;

export interface TwigStatement extends TwigAstNodeBase {
  kind: "TwigStatement";
  name: string | null;
  arguments: TwigExpression[];
  bindings: TwigBinding[];
  tokens: TwigLexeme[];
}

export interface TwigBinding extends SourceRange {
  name: string;
  role: "variable" | "parameter" | "macro" | "block" | "import";
}

const PRECEDENCE = Object.fromEntries(TWIG_3_SPEC.operators.map((operator) => [operator.name, operator.precedence]));
const RIGHT_ASSOCIATIVE = new Set(TWIG_3_SPEC.operators.filter((operator) => operator.associativity === "right").map((operator) => operator.name));

export function parseTwigExpression(source: string, baseOffset = 0): TwigExpression {
  return new ExpressionParser(lexTwig(source, baseOffset)).parse();
}

export function parseTwigStatement(source: string, baseOffset = 0): TwigStatement {
  const tokens = lexTwig(source, baseOffset);
  const significant = tokens.filter((token) => token.kind !== "whitespace" && token.kind !== "eof");
  const first = significant[0];
  const name = first && (first.kind === "name" || first.kind === "operator") ? first.value.toLowerCase() : null;
  const bindings: TwigBinding[] = [];
  let argumentStart = first ? first.end - baseOffset : source.length;
  const tokenIndex = (value: string) => significant.findIndex((token) => token.value.toLowerCase() === value);
  const bind = (token: TwigLexeme | undefined, role: TwigBinding["role"]) => {
    if (token?.kind === "name") bindings.push({ name: token.value, role, start: token.start, end: token.end });
  };
  if (name === "set") {
    const equals = tokenIndex("=");
    significant.slice(1, equals < 0 ? 2 : equals).filter((token) => token.kind === "name").forEach((token) => bind(token, "variable"));
    argumentStart = equals < 0 ? source.length : significant[equals].end - baseOffset;
  } else if (name === "for") {
    const inIndex = tokenIndex("in");
    significant.slice(1, inIndex < 0 ? 2 : inIndex).filter((token) => token.kind === "name").forEach((token) => bind(token, "variable"));
    argumentStart = inIndex < 0 ? source.length : significant[inIndex].end - baseOffset;
  } else if (name === "macro") {
    bind(significant[1], "macro");
    const open = significant.findIndex((token) => token.value === "(");
    const close = significant.findIndex((token, index) => index > open && token.value === ")");
    for (let index = open + 1; index < (close < 0 ? significant.length : close); index += 1) {
      const token = significant[index];
      if (token.kind === "name" && (index === open + 1 || significant[index - 1]?.value === ",")) bind(token, "parameter");
    }
    argumentStart = source.length;
  } else if (name === "block") {
    bind(significant[1], "block"); argumentStart = source.length;
  } else if (name === "import") {
    const asIndex = tokenIndex("as"); bind(significant[asIndex + 1], "import"); argumentStart = source.length;
  } else if (name === "from") {
    const importIndex = tokenIndex("import");
    for (let index = importIndex + 1; index < significant.length; index += 1) {
      const token = significant[index];
      if (token.kind !== "name" || token.value === "as") continue;
      if (significant[index - 1]?.value === "as" || significant[index + 1]?.value !== "as") bind(token, "import");
    }
    argumentStart = source.length;
  } else if (name === "types") {
    for (let index = 1; index < significant.length; index += 1) {
      const token = significant[index];
      if (token.kind !== "name") continue;
      const next = significant[index + 1]?.value;
      const delimiter = next === "?" ? significant[index + 2]?.value : next;
      if (delimiter === ":" || delimiter === "?:") bind(token, "variable");
    }
    argumentStart = source.length;
  }
  const argumentSource = source.slice(argumentStart);
  const argumentsList = argumentSource.trim() ? [parseTwigExpression(argumentSource, baseOffset + argumentStart)] : [];
  if (name === "with" && argumentsList[0]?.kind === "MapExpression") {
    for (const item of argumentsList[0].items) {
      if ("key" in item && item.key.kind === "NameExpression") bindings.push({ name: item.key.name, role: "variable", start: item.key.start, end: item.key.end });
    }
  }
  return {
    kind: "TwigStatement", name, arguments: argumentsList, bindings, tokens,
    start: first?.start ?? baseOffset, end: significant.at(-1)?.end ?? baseOffset,
    complete: argumentsList.every((argument) => argument.complete)
  };
}

class ExpressionParser {
  private readonly tokens: TwigLexeme[];
  private index = 0;
  constructor(tokens: TwigLexeme[]) { this.tokens = tokens.filter((token) => token.kind !== "whitespace" && token.kind !== "comment"); }
  parse(): TwigExpression { return this.parseExpression(0); }

  private parseExpression(minimum: number): TwigExpression {
    let left = this.parsePrefix();
    while (true) {
      const token = this.current();
      if (token.value === "." || token.value === "?." || token.value === "[" || token.value === "(" || token.value === "|") {
        left = this.parsePostfix(left);
        continue;
      }
      if (token.value === "is") { left = this.parseTest(left); continue; }
      if (token.value === "=>") {
        const parameters = left.kind === "NameExpression" ? [left]
          : left.kind === "ParenthesizedExpression" && left.expression.kind === "NameExpression" ? [left.expression] : [];
        if (minimum > 0 || parameters.length === 0) break;
        this.advance(); const body = this.parseExpression(0);
        left = { kind: "ArrowFunctionExpression", parameters, body, start: left.start, end: body.end, complete: left.complete && body.complete };
        continue;
      }
      if (token.value === "?") {
        if (minimum > 0) break;
        this.advance();
        const consequent = this.parseExpression(0);
        this.consume(":");
        const alternate = this.parseExpression(0);
        left = { kind: "ConditionalExpression", test: left, consequent, alternate, start: left.start, end: alternate.end, complete: left.complete && consequent.complete && alternate.complete };
        continue;
      }
      const operator = this.readOperator();
      const precedence = PRECEDENCE[operator];
      if (precedence === undefined || precedence < minimum) break;
      const operatorRange = this.consumeOperator(operator);
      const right = this.parseExpression(precedence + (RIGHT_ASSOCIATIVE.has(operator) ? 0 : 1));
      left = { kind: "BinaryExpression", operator, operatorRange, left, right, start: left.start, end: right.end, complete: left.complete && right.complete };
    }
    return left;
  }

  private parsePrefix(): TwigExpression {
    const token = this.current();
    if (token.kind === "eof") return this.missing("expression", token.start);
    if (["not", "+", "-"].includes(token.value)) {
      this.advance(); const operand = this.parseExpression(10);
      return { kind: "UnaryExpression", operator: token.value, operatorRange: { start: token.start, end: token.end }, operand, start: token.start, end: operand.end, complete: operand.complete };
    }
    if (token.value === "...") {
      const start = this.advance().start; const expression = this.parseExpression(15);
      return { kind: "SpreadExpression", operatorRange: { start, end: token.end }, expression, start, end: expression.end, complete: expression.complete };
    }
    if (token.value === "(") {
      const arrow = this.tryParseParenthesizedArrow();
      if (arrow) return arrow;
      const start = this.advance().start; const expression = this.parseExpression(0); const close = this.consume(")");
      return { kind: "ParenthesizedExpression", expression, start, end: close?.end ?? expression.end, complete: expression.complete && Boolean(close) };
    }
    if (token.value === "[" || token.value === "{") return this.parseCollection();
    this.advance();
    if (token.kind === "name") {
      const lower = token.value.toLowerCase();
      if (["true", "false", "null", "none"].includes(lower)) return { kind: "LiteralExpression", value: lower === "true" ? true : lower === "false" ? false : null, raw: token.value, start: token.start, end: token.end, complete: true };
      return { kind: "NameExpression", name: token.value, start: token.start, end: token.end, complete: true };
    }
    if (token.kind === "number" || token.kind === "string") return { kind: "LiteralExpression", value: token.kind === "number" ? Number(token.value.replaceAll("_", "")) : token.value.slice(1, token.complete ? -1 : undefined), raw: token.value, start: token.start, end: token.end, complete: token.complete };
    return { kind: "ErrorExpression", message: `Unexpected token ${token.value}`, raw: token.value, start: token.start, end: token.end, complete: false };
  }

  private parsePostfix(input: TwigExpression): TwigExpression {
    const token = this.current();
    if (token.value === "." || token.value === "?.") {
      const optional = token.value === "?.";
      const operator = this.advance(); const property = this.parsePrefix();
      return { kind: "MemberExpression", object: input, property, computed: false, optional, operatorRange: { start: operator.start, end: operator.end }, start: input.start, end: property.end, complete: input.complete && property.complete };
    }
    if (token.value === "[") {
      this.advance(); const property = this.parseExpression(0); const close = this.consume("]");
      return { kind: "MemberExpression", object: input, property, computed: true, start: input.start, end: close?.end ?? property.end, complete: input.complete && property.complete && Boolean(close) };
    }
    if (token.value === "|") {
      this.advance(); const nameToken = this.current();
      const filter: NameExpression = nameToken.kind === "name" ? (this.advance(), { kind: "NameExpression", name: nameToken.value, start: nameToken.start, end: nameToken.end, complete: true }) : this.missingName("filter", nameToken.start);
      const args = this.current().value === "(" ? this.parseArguments() : [];
      return { kind: "FilterExpression", input, filter, arguments: args, start: input.start, end: args.at(-1)?.end ?? filter.end, complete: input.complete && filter.complete && args.every((arg) => arg.complete) };
    }
    const args = this.parseArguments();
    return { kind: "CallExpression", callee: input, arguments: args, start: input.start, end: this.previous().end, complete: input.complete && args.every((arg) => arg.complete) && this.previous().value === ")" };
  }

  private parseArguments(): TwigExpression[] {
    this.consume("("); const args: TwigExpression[] = [];
    while (this.current().kind !== "eof" && this.current().value !== ")") {
      if (this.current().kind === "name" && [":", "="].includes(this.tokens[this.index + 1]?.value)) {
        const token = this.advance(); this.advance();
        const name: NameExpression = { kind: "NameExpression", name: token.value, start: token.start, end: token.end, complete: true };
        const value = this.parseExpression(0);
        args.push({ kind: "NamedArgumentExpression", name, value, start: name.start, end: value.end, complete: value.complete });
      } else args.push(this.parseExpression(0));
      if (!this.consume(",")) break;
    }
    this.consume(")"); return args;
  }

  private parseCollection(): CollectionExpression {
    const open = this.advance(); const closeValue = open.value === "[" ? "]" : "}";
    const items: CollectionExpression["items"] = [];
    while (this.current().kind !== "eof" && this.current().value !== closeValue) {
      const first = this.parseExpression(0);
      if (open.value === "{" && this.consume(":")) items.push({ key: first, value: this.parseExpression(0) });
      else items.push(first);
      if (!this.consume(",")) break;
    }
    const close = this.consume(closeValue);
    return { kind: open.value === "[" ? "ArrayExpression" : "MapExpression", items, start: open.start, end: close?.end ?? (items.at(-1) && "end" in items.at(-1)! ? (items.at(-1)! as TwigExpression).end : open.end), complete: Boolean(close) };
  }

  private parseTest(input: TwigExpression): TestExpression {
    this.advance(); let negated = false;
    if (this.current().value === "not") { negated = true; this.advance(); }
    const token = this.current();
    const test = token.kind === "name" ? (this.advance(), { kind: "NameExpression", name: token.value, start: token.start, end: token.end, complete: true } as NameExpression) : this.missingName("test", token.start);
    const args = this.current().value === "(" ? this.parseArguments() : [];
    return { kind: "TestExpression", input, test, negated, arguments: args, start: input.start, end: args.at(-1)?.end ?? test.end, complete: input.complete && test.complete };
  }

  private readOperator(): string {
    const current = this.current().value;
    const next = this.tokens[this.index + 1]?.value;
    if ((current === "starts" || current === "ends") && next === "with") return `${current} with`;
    if (current === "not" && next === "in") return "not in";
    if (current === "has" && (next === "some" || next === "every")) return `has ${next}`;
    return current;
  }
  private tryParseParenthesizedArrow(): ArrowFunctionExpression | null {
    let cursor = this.index + 1; const parameters: TwigLexeme[] = [];
    while (this.tokens[cursor]?.value !== ")") {
      const parameter = this.tokens[cursor];
      if (!parameter || parameter.kind !== "name") return null;
      parameters.push(parameter); cursor += 1;
      if (this.tokens[cursor]?.value === ",") cursor += 1;
      else if (this.tokens[cursor]?.value !== ")") return null;
    }
    if (parameters.length === 0 || this.tokens[cursor + 1]?.value !== "=>") return null;
    const start = this.advance().start;
    const names = parameters.map(() => {
      const token = this.advance();
      const name: NameExpression = { kind: "NameExpression", name: token.value, start: token.start, end: token.end, complete: true };
      this.consume(","); return name;
    });
    this.consume(")"); this.consume("=>");
    const body = this.parseExpression(0);
    return { kind: "ArrowFunctionExpression", parameters: names, body, start, end: body.end, complete: body.complete };
  }
  private consumeOperator(operator: string): SourceRange {
    const first = this.advance();
    const last = operator.includes(" ") ? this.advance() : first;
    return { start: first.start, end: last.end };
  }
  private current(): TwigLexeme { return this.tokens[this.index] ?? this.tokens.at(-1)!; }
  private previous(): TwigLexeme { return this.tokens[Math.max(0, this.index - 1)]; }
  private advance(): TwigLexeme { const token = this.current(); if (token.kind !== "eof") this.index += 1; return token; }
  private consume(value: string): TwigLexeme | null { if (this.current().value !== value) return null; return this.advance(); }
  private missing(expected: string, offset: number): MissingExpression { return { kind: "MissingExpression", expected, start: offset, end: offset, complete: false }; }
  private missingName(_expected: string, offset: number): NameExpression { return { kind: "NameExpression", name: "", start: offset, end: offset, complete: false }; }
}

export function visitTwigExpression(node: TwigExpression, visitor: (node: TwigExpression) => void): void {
  visitor(node);
  if (node.kind === "UnaryExpression") visitTwigExpression(node.operand, visitor);
  else if (node.kind === "BinaryExpression") { visitTwigExpression(node.left, visitor); visitTwigExpression(node.right, visitor); }
  else if (node.kind === "MemberExpression") { visitTwigExpression(node.object, visitor); visitTwigExpression(node.property, visitor); }
  else if (node.kind === "CallExpression") { visitTwigExpression(node.callee, visitor); node.arguments.forEach((item) => visitTwigExpression(item, visitor)); }
  else if (node.kind === "FilterExpression") { visitTwigExpression(node.input, visitor); visitor(node.filter); node.arguments.forEach((item) => visitTwigExpression(item, visitor)); }
  else if (node.kind === "TestExpression") { visitTwigExpression(node.input, visitor); visitor(node.test); node.arguments.forEach((item) => visitTwigExpression(item, visitor)); }
  else if (node.kind === "ConditionalExpression") { visitTwigExpression(node.test, visitor); visitTwigExpression(node.consequent, visitor); visitTwigExpression(node.alternate, visitor); }
  else if (node.kind === "NamedArgumentExpression") { visitor(node.name); visitTwigExpression(node.value, visitor); }
  else if (node.kind === "ArrowFunctionExpression") { node.parameters.forEach((parameter) => visitor(parameter)); visitTwigExpression(node.body, visitor); }
  else if (node.kind === "ParenthesizedExpression") visitTwigExpression(node.expression, visitor);
  else if (node.kind === "SpreadExpression") visitTwigExpression(node.expression, visitor);
  else if (node.kind === "ArrayExpression" || node.kind === "MapExpression") for (const item of node.items) {
    if ("key" in item) { visitTwigExpression(item.key, visitor); visitTwigExpression(item.value, visitor); }
    else visitTwigExpression(item, visitor);
  }
}
