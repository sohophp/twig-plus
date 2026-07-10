import { getTwigTagKind, getTwigTagName } from "./twigStructure";
import { tokenizeTwig } from "./twigTokenizer";

export type TwigStructureSymbolKind = "block" | "macro" | "set";

export interface TwigBlockSymbolData {
  kind: TwigStructureSymbolKind;
  name: string;
  start: number;
  end: number;
  nameStart: number;
  nameEnd: number;
  bodyStart: number;
}

export interface TwigMacroImport {
  kind: "import" | "from";
  template: string;
  exportedName: string;
  localName: string;
  alias: string | null;
}

export interface TwigMacroReference {
  alias: string | null;
  kind: "import" | "from" | "self";
  name: string;
}

export function collectTwigBlockSymbols(source: string): TwigBlockSymbolData[] {
  return collectTwigStructureSymbols(source).filter(
    (symbol) => symbol.kind === "block"
  );
}

export function collectTwigStructureSymbols(source: string): TwigBlockSymbolData[] {
  const tokens = tokenizeTwig(source);
  const stack: TwigBlockSymbolData[] = [];
  const symbols: TwigBlockSymbolData[] = [];

  for (const token of tokens) {
    if (token.type !== "tag") {
      continue;
    }

    const content = normalizeTwigInner(token.inner);
    const tagName = getTwigTagName(content);
    if (!tagName) {
      continue;
    }

    const tagKind = getTwigTagKind(content);

    if (tagKind === "opening") {
      const symbolKind = getTwigStructureSymbolKind(content);
      if (!symbolKind) {
        continue;
      }

      const symbolName = getDirectiveArgument(content, tagName);
      if (!symbolName) {
        continue;
      }

      const relativeNameIndex = content.indexOf(symbolName);
      const nameStart = token.start + 2 + relativeNameIndex;
      const nameEnd = nameStart + symbolName.length;

      stack.push({
        kind: symbolKind,
        name: symbolName,
        start: token.start,
        end: token.end,
        nameStart,
        nameEnd,
        bodyStart: token.end
      });
      continue;
    }

    if (tagKind === "closing") {
      const structureKind = getTwigClosingStructureKind(tagName);
      if (!structureKind) {
        continue;
      }

      const stackIndex = findLastIndex(
        stack,
        (symbol) => symbol.kind === structureKind
      );
      if (stackIndex === -1) {
        continue;
      }

      const block = stack.splice(stackIndex, 1)[0];
      if (block !== undefined) {
        symbols.push({
          ...block,
          end: token.end
        });
      }
    }
  }

  return symbols.sort((left, right) => left.start - right.start);
}

export function getBlockReferenceAtOffset(
  source: string,
  offset: number
): TwigBlockSymbolData | null {
  return (
    collectTwigStructureSymbols(source).find(
      (symbol) => offset >= symbol.nameStart && offset <= symbol.nameEnd
    ) ?? null
  );
}

export function collectTwigMacroImports(source: string): TwigMacroImport[] {
  const imports: TwigMacroImport[] = [];

  for (const token of tokenizeTwig(source)) {
    if (token.type !== "tag") {
      continue;
    }

    const content = normalizeTwigInner(token.inner);
    const importMatch = content.match(
      /^import\s+['"]([^'"]+)['"]\s+as\s+([A-Za-z_][A-Za-z0-9_]*)/i
    );

    if (importMatch) {
      imports.push({
        kind: "import",
        template: importMatch[1],
        exportedName: "*",
        localName: importMatch[2],
        alias: importMatch[2]
      });
      continue;
    }

    const fromMatch = content.match(
      /^from\s+['"]([^'"]+)['"]\s+import\s+([\s\S]+)$/i
    );

    if (!fromMatch) {
      continue;
    }

    const [, template, specifiers] = fromMatch;
    for (const specifier of specifiers.split(",")) {
      const normalizedSpecifier = specifier.trim();
      if (!normalizedSpecifier) {
        continue;
      }

      const specifierMatch = normalizedSpecifier.match(
        /^([A-Za-z_][A-Za-z0-9_]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?$/
      );
      if (!specifierMatch) {
        continue;
      }

      const exportedName = specifierMatch[1];
      const localName = specifierMatch[2] ?? exportedName;

      imports.push({
        kind: "from",
        template,
        exportedName,
        localName,
        alias: null
      });
    }
  }

  return imports;
}

export function getTwigMacroReferenceAtOffset(
  source: string,
  offset: number
): TwigMacroReference | null {
  for (const token of tokenizeTwig(source)) {
    if (token.type === "comment" || offset < token.start || offset > token.end) {
      continue;
    }

    const reference = getTwigMacroReferenceFromToken(token.raw, token.start, offset);
    if (reference) {
      return reference;
    }
  }

  return null;
}

export function getExtendsTemplateReference(source: string): string | null {
  for (const token of tokenizeTwig(source)) {
    if (token.type !== "tag") {
      continue;
    }

    const content = normalizeTwigInner(token.inner);
    const match = content.match(/^extends\s+['"]([^'"]+)['"]/i);
    if (match) {
      return match[1];
    }
  }

  return null;
}

function getDirectiveArgument(content: string, directive: string): string | null {
  const match = content.match(
    new RegExp(`^${directive}\\s+([A-Za-z_][A-Za-z0-9_]*)`)
  );
  return match ? match[1] : null;
}

function normalizeTwigInner(inner: string): string {
  return inner.trim().replace(/^[-~]\s*/, "").replace(/\s*[-~]$/, "");
}

function getTwigMacroReferenceFromToken(
  raw: string,
  tokenStart: number,
  offset: number
): TwigMacroReference | null {
  for (const match of raw.matchAll(
    /([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\s*\(/g
  )) {
    const alias = match[1];
    const name = match[2];
    const matchStart = tokenStart + (match.index ?? 0);
    const aliasStart = matchStart;
    const aliasEnd = aliasStart + alias.length;
    const nameStart = aliasEnd + 1;
    const nameEnd = nameStart + name.length;

    if (offset >= aliasStart && offset <= nameEnd) {
      return {
        alias,
        kind: alias === "_self" ? "self" : "import",
        name
      };
    }
  }

  for (const match of raw.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)) {
    const name = match[1];
    const matchStart = tokenStart + (match.index ?? 0);
    const nameStart = matchStart;
    const nameEnd = nameStart + name.length;

    if (offset < nameStart || offset > nameEnd) {
      continue;
    }

    const previousCharacter = raw[(match.index ?? 0) - 1];
    if (previousCharacter === ".") {
      continue;
    }

    return {
      alias: null,
      kind: "from",
      name
    };
  }

  return null;
}

function getTwigStructureSymbolKind(
  content: string
): TwigStructureSymbolKind | null {
  const tagName = getTwigTagName(content);

  if (tagName === "block") {
    return "block";
  }

  if (tagName === "macro") {
    return "macro";
  }

  if (tagName === "set" && !content.includes("=")) {
    return "set";
  }

  return null;
}

function getTwigClosingStructureKind(
  tagName: string
): TwigStructureSymbolKind | null {
  if (tagName === "endblock") {
    return "block";
  }

  if (tagName === "endmacro") {
    return "macro";
  }

  if (tagName === "endset") {
    return "set";
  }

  return null;
}

function findLastIndex<T>(
  items: T[],
  predicate: (item: T) => boolean
): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) {
      return index;
    }
  }

  return -1;
}
