import { getTwigTagKind, getTwigTagName } from "../formatter/rules";
import { tokenizeTwig } from "../formatter/twigTokenizer";

export interface TwigBlockSymbolData {
  name: string;
  start: number;
  end: number;
  nameStart: number;
  nameEnd: number;
  bodyStart: number;
}

export function collectTwigBlockSymbols(source: string): TwigBlockSymbolData[] {
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

    if (tagName === "block" && getTwigTagKind(content) === "opening") {
      const blockName = getDirectiveArgument(content, "block");
      if (!blockName) {
        continue;
      }

      const relativeNameIndex = content.indexOf(blockName);
      const nameStart = token.start + 2 + relativeNameIndex;
      const nameEnd = nameStart + blockName.length;

      stack.push({
        name: blockName,
        start: token.start,
        end: token.end,
        nameStart,
        nameEnd,
        bodyStart: token.end
      });
      continue;
    }

    if (tagName === "endblock" && getTwigTagKind(content) === "closing") {
      const block = stack.pop();
      if (block) {
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
    collectTwigBlockSymbols(source).find(
      (symbol) => offset >= symbol.nameStart && offset <= symbol.nameEnd
    ) ?? null
  );
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
  const match = content.match(new RegExp(`^${directive}\\s+([A-Za-z_][A-Za-z0-9_]*)`));
  return match ? match[1] : null;
}

function normalizeTwigInner(inner: string): string {
  return inner.trim().replace(/^[-~]\s*/, "").replace(/\s*[-~]$/, "");
}
