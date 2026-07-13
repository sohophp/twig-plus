import {
  DEFAULT_TEMPLATE_ROOTS,
  resolveTemplateWorkspacePath
} from "./templateCompletion";
import { getTwigTagKind, getTwigTagName } from "./twigStructure";
import { tokenizeTwig } from "./twigTokenizer";
import type { HybridDocument, TwigNode } from "./hybridAst";
import { getTwigTag } from "@twig-plus/language-spec";

export type TwigDiagnosticSeverity = "error" | "warning" | "hint";

export interface TwigDiagnostic {
  code?: string;
  message: string;
  severity: TwigDiagnosticSeverity;
  start: number;
  end: number;
}

export function getTwigDiagnosticCode(message: string): string {
  if (message.startsWith("Unclosed Twig tag")) return "unclosed-tag";
  if (message.startsWith("Unexpected closing Twig tag")) return "unexpected-closing-tag";
  if (message.startsWith("Unexpected Twig tag")) return "unexpected-middle-tag";
  if (message.startsWith("Duplicate Twig block")) return "duplicate-block";
  if (message.startsWith("Template ")) return "missing-template";
  if (message.startsWith("Empty Twig output")) return "empty-output";
  return "twig-diagnostic";
}

interface StackEntry {
  name: string;
  tokenStart: number;
  tokenEnd: number;
}

export function analyzeTwigDiagnostics(
  source: string,
  workspacePaths: string[] = [],
  currentWorkspacePath?: string,
  templateRoots: string[] = DEFAULT_TEMPLATE_ROOTS
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
      currentWorkspacePath,
      templateRoots,
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
      const top = structureStack.at(-1);

      if (!top || !getTwigTag(top.name)?.branches?.includes(tagName)) {
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
      const expectedOpening = getTwigTag(tagName)?.opens;
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

export function analyzeHybridDiagnostics(
  document: HybridDocument,
  workspacePaths: string[] = [],
  currentWorkspacePath?: string,
  templateRoots: string[] = DEFAULT_TEMPLATE_ROOTS
): TwigDiagnostic[] {
  const diagnostics: TwigDiagnostic[] = [];
  const stack: TwigNode[] = [];
  const blocks = new Set<string>();
  for (const node of document.children) {
    if (node.kind === "TwigOutput" && !node.inner.trim()) diagnostics.push({ message: "Empty Twig output block.", severity: "hint", start: node.start, end: node.end });
    if (node.kind !== "TwigTag" || !node.tagName || !node.tagKind) continue;
    const block = node.statement?.bindings.find((binding) => binding.role === "block");
    if (block) {
      if (blocks.has(block.name)) diagnostics.push({ message: `Duplicate Twig block "${block.name}".`, severity: "warning", start: node.start, end: node.end });
      else blocks.add(block.name);
    }
    const relation = node.statement && ["extends", "include", "embed", "import", "from"].includes(node.statement.name ?? "")
      ? extractTemplateRelation(node) : null;
    if (relation && relation.reference.endsWith(".twig") && workspacePaths.length > 0 && !resolveTemplateWorkspacePath(workspacePaths, relation.reference, currentWorkspacePath, templateRoots)) {
      diagnostics.push({
        message: `Template "${relation.reference}" referenced by "${node.statement!.name}" was not found. Searched Twig template roots: ${templateRoots.join(", ")}. Configure twigPlus.templates.roots if your project uses another template directory.`,
        severity: "warning", start: relation.start, end: relation.end
      });
    }
    if (node.tagKind === "opening") stack.push(node);
    else if (node.tagKind === "middle") {
      const top = stack.at(-1);
      if (!top?.tagName || !getTwigTag(top.tagName)?.branches?.includes(node.tagName)) diagnostics.push({ message: `Unexpected Twig tag "${node.tagName}".`, severity: "error", start: node.start, end: node.end });
    } else if (node.tagKind === "closing") {
      const expected = getTwigTag(node.tagName)?.opens;
      if (!expected || stack.at(-1)?.tagName !== expected) diagnostics.push({ message: `Unexpected closing Twig tag "${node.tagName}".`, severity: "error", start: node.start, end: node.end });
      else stack.pop();
    }
  }
  for (const node of stack) diagnostics.push({ message: `Unclosed Twig tag "${node.tagName}".`, severity: "error", start: node.start, end: node.end });
  return diagnostics.sort((left, right) => left.start - right.start);
}

function extractTemplateRelation(node: TwigNode): { reference: string; start: number; end: number } | null {
  const token = node.statement?.tokens.find((item) => item.kind === "string");
  if (!token) return null;
  const reference = token.value.slice(1, token.complete ? -1 : undefined);
  return { reference, start: token.start + 1, end: Math.max(token.start + 1, token.end - (token.complete ? 1 : 0)) };
}

function collectTemplateReferenceDiagnostic(
  content: string,
  tokenStart: number,
  workspacePaths: string[],
  currentWorkspacePath: string | undefined,
  templateRoots: string[],
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

  if (
    workspacePaths.length > 0 &&
    !resolveTemplateWorkspacePath(
      workspacePaths,
      referencePath,
      currentWorkspacePath,
      templateRoots
    )
  ) {
    const quoteIndex = content.indexOf(referencePath);
    diagnostics.push({
      message: `Template "${referencePath}" referenced by "${directive}" was not found. Searched Twig template roots: ${templateRoots.join(", ")}. Configure twigPlus.templates.roots if your project uses another template directory.`,
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
