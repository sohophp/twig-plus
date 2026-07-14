import {
  DEFAULT_TEMPLATE_ROOTS,
  resolveTemplateWorkspacePath
} from "./templateCompletion";
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
