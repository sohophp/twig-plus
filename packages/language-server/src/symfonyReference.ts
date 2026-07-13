export type SymfonyReferenceKind = "route" | "asset" | "translation";

export interface SymfonyReferenceMatch {
  kind: SymfonyReferenceKind;
  prefix: string;
  start: number;
  end: number;
}

/** Finds a Symfony reference string without evaluating the Twig expression. */
export function getSymfonyReferenceMatch(source: string, offset: number): SymfonyReferenceMatch | null {
  const before = source.slice(0, offset);
  const functionMatch = before.match(/\b(path|url|asset|trans)\s*\(\s*(['"])([^'"]*)$/i);
  if (functionMatch) {
    const prefix = functionMatch[3];
    return {
      kind: functionMatch[1].toLowerCase() === "asset" ? "asset"
        : functionMatch[1].toLowerCase() === "trans" ? "translation" : "route",
      prefix,
      start: offset - prefix.length,
      end: offset
    };
  }

  const stringMatch = before.match(/(['"])([^'"]*)$/);
  if (!stringMatch) return null;
  const after = source.slice(offset);
  if (!new RegExp(`^${escapeRegex(stringMatch[1])}\\s*\\|\\s*(?:trans|t)\\b`, "i").test(after)) return null;
  return { kind: "translation", prefix: stringMatch[2], start: offset - stringMatch[2].length, end: offset };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
