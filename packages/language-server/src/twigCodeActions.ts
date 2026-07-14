import {
  analyzeHybridDiagnostics,
  getTwigTag,
  type HybridDocument,
  type SourceRange
} from "@twig-plus/parser";

export interface StructuralDiagnostic {
  code: string;
  message: string;
  range: SourceRange;
}

export interface TwigQuickFix {
  title: string;
  diagnosticCodes: string[];
  edits: Array<{ range: SourceRange; newText: string }>;
  preferred?: boolean;
}

export function getTwigStructuralQuickFixes(
  document: HybridDocument,
  diagnostics: StructuralDiagnostic[]
): TwigQuickFix[] {
  const fixes: TwigQuickFix[] = [];
  if (diagnostics.some((diagnostic) => diagnostic.code === "unclosed-tag")) {
    const unclosed = analyzeHybridDiagnostics(document)
      .filter((diagnostic) => diagnostic.code === "unclosed-tag" || diagnostic.message.startsWith("Unclosed Twig tag"));
    const closings = [...unclosed].reverse().flatMap((diagnostic) => {
      const opening = diagnostic.message.match(/^Unclosed Twig tag "([A-Za-z_][\w]*)"/)?.[1];
      const closing = opening ? getTwigTag(opening)?.closing : undefined;
      if (!closing) return [];
      return [`${lineIndentAt(document.source, diagnostic.start)}{% ${closing} %}`];
    });
    if (closings.length > 0) fixes.push({
      title: closings.length === 1 ? `Insert ${closings[0].trim()}` : "Insert all missing Twig closing tags",
      diagnosticCodes: ["unclosed-tag"],
      preferred: true,
      edits: [{
        range: { start: document.end, end: document.end },
        newText: `${document.source.endsWith("\n") || document.source.length === 0 ? "" : "\n"}${closings.join("\n")}`
      }]
    });
  }
  for (const diagnostic of diagnostics) {
    if (diagnostic.code === "unexpected-closing-tag" || diagnostic.code === "unexpected-middle-tag") fixes.push({
      title: `Remove ${document.source.slice(diagnostic.range.start, diagnostic.range.end).trim()}`,
      diagnosticCodes: [diagnostic.code],
      edits: [{ range: diagnostic.range, newText: "" }]
    });
    if (diagnostic.code === "empty-output") fixes.push({
      title: "Remove empty Twig output",
      diagnosticCodes: [diagnostic.code],
      preferred: true,
      edits: [{ range: diagnostic.range, newText: "" }]
    });
  }
  return fixes;
}

function lineIndentAt(source: string, offset: number): string {
  const lineStart = source.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
  return source.slice(lineStart, offset).match(/^[\t ]*/)?.[0] ?? "";
}
