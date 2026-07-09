import { getTwigTagKind, getTwigTagName } from "../formatter/rules";
import { tokenizeTwig } from "../formatter/twigTokenizer";
import { resolveTemplateWorkspacePath } from "../project/templateCompletion";

export type TwigDiagnosticSeverity = "error" | "warning" | "hint";

export interface TwigDiagnostic {
  message: string;
  severity: TwigDiagnosticSeverity;
  start: number;
  end: number;
}

interface StackEntry {
  name: string;
  tokenStart: number;
  tokenEnd: number;
}

const CLOSING_TO_OPENING: Record<string, string> = {
  endif: "if",
  endfor: "for",
  endblock: "block",
  endembed: "embed",
  endmacro: "macro",
  endapply: "apply",
  endfilter: "filter",
  endautoescape: "autoescape",
  endwith: "with",
  endspaceless: "spaceless",
  endset: "set"
};

const MIDDLE_EXPECTATIONS: Record<string, string> = {
  else: "if",
  elseif: "if",
  empty: "for"
};

export function analyzeTwigDiagnostics(
  source: string,
  workspacePaths: string[] = []
): TwigDiagnostic[] {
  const diagnostics: TwigDiagnostic[] = [];
  const tokens = tokenizeTwig(source);
  const structureStack: StackEntry[] = [];
  const seenBlockNames = new Map<string, StackEntry>();

  for (const token of tokens) {
    if (token.type === "output") {
      if (!token.inner.trim()) {
        diagnostics.push({
          message: "Empty Twig output block.",
          severity: "hint",
          start: token.start,
          end: token.end
        });
      }
      continue;
    }

    if (token.type !== "tag") {
      continue;
    }

    const content = normalizeTwigInner(token.inner);
    const tagName = getTwigTagName(content);
    const tagKind = getTwigTagKind(content);

    if (!tagName) {
      continue;
    }

    collectTemplateReferenceDiagnostic(
      content,
      token.start,
      workspacePaths,
      diagnostics
    );

    if (tagName === "block") {
      const blockName = getDirectiveArgument(content, "block");
      if (blockName) {
        const previous = seenBlockNames.get(blockName);
        if (previous) {
          diagnostics.push({
            message: `Duplicate Twig block "${blockName}".`,
            severity: "warning",
            start: token.start,
            end: token.end
          });
        } else {
          seenBlockNames.set(blockName, {
            name: blockName,
            tokenStart: token.start,
            tokenEnd: token.end
          });
        }
      }
    }

    if (tagKind === "opening") {
      structureStack.push({
        name: tagName,
        tokenStart: token.start,
        tokenEnd: token.end
      });
      continue;
    }

    if (tagKind === "middle") {
      const expected = MIDDLE_EXPECTATIONS[tagName];
      const top = structureStack.at(-1);

      if (!expected || !top || top.name !== expected) {
        diagnostics.push({
          message: `Unexpected Twig tag "${tagName}".`,
          severity: "error",
          start: token.start,
          end: token.end
        });
      }
      continue;
    }

    if (tagKind === "closing") {
      const expectedOpening = CLOSING_TO_OPENING[tagName];
      const top = structureStack.at(-1);

      if (!expectedOpening || !top || top.name !== expectedOpening) {
        diagnostics.push({
          message: `Unexpected closing Twig tag "${tagName}".`,
          severity: "error",
          start: token.start,
          end: token.end
        });
        continue;
      }

      structureStack.pop();
    }
  }

  for (const entry of structureStack) {
    diagnostics.push({
      message: `Unclosed Twig tag "${entry.name}".`,
      severity: "error",
      start: entry.tokenStart,
      end: entry.tokenEnd
    });
  }

  return diagnostics.sort((left, right) => left.start - right.start);
}

function collectTemplateReferenceDiagnostic(
  content: string,
  tokenStart: number,
  workspacePaths: string[],
  diagnostics: TwigDiagnostic[]
): void {
  const match = content.match(/^(extends|include|embed|import|from)\s+['"]([^'"]+)['"]/i);
  if (!match) {
    return;
  }

  const [, directive, referencePath] = match;
  if (!referencePath.endsWith(".twig")) {
    return;
  }

  if (workspacePaths.length > 0 && !resolveTemplateWorkspacePath(workspacePaths, referencePath)) {
    const quoteIndex = content.indexOf(referencePath);
    diagnostics.push({
      message: `Template "${referencePath}" referenced by "${directive}" was not found.`,
      severity: "warning",
      start: tokenStart + 2 + quoteIndex,
      end: tokenStart + 2 + quoteIndex + referencePath.length
    });
  }
}

function getDirectiveArgument(content: string, directive: string): string | null {
  const match = content.match(new RegExp(`^${directive}\\s+([A-Za-z_][A-Za-z0-9_]*)`));
  return match ? match[1] : null;
}

function normalizeTwigInner(inner: string): string {
  return inner.trim().replace(/^[-~]\s*/, "").replace(/\s*[-~]$/, "");
}
