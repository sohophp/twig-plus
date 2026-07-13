export type SymfonyReferenceKind = "route" | "asset" | "translation" | "form" | "security" | "fragment" | "importmap";

export interface SymfonyReferenceMatch {
  kind: SymfonyReferenceKind;
  prefix: string;
  start: number;
  end: number;
}

/** Finds a Symfony reference string without evaluating the Twig expression. */
export function getSymfonyReferenceMatch(source: string, offset: number): SymfonyReferenceMatch | null {
  const before = source.slice(0, offset);
  const functionMatch = before.match(/\b(path|url|asset|trans|is_granted|controller|importmap)\s*\(\s*(['"])([^'"]*)$/i);
  if (functionMatch) {
    const prefix = functionMatch[3];
    return {
      kind: functionKind(functionMatch[1]),
      prefix,
      start: offset - prefix.length,
      end: offset
    };
  }

  const formTheme = before.match(/\bform_theme\s+[^%}]+?\s+(?:with\s+)?(?:\[\s*)?(['"])([^'"]*)$/i);
  if (formTheme) {
    const prefix = formTheme[2];
    return { kind: "form", prefix, start: offset - prefix.length, end: offset };
  }

  const stringMatch = before.match(/(['"])([^'"]*)$/);
  if (!stringMatch) return null;
  const after = source.slice(offset);
  if (!new RegExp(`^${escapeRegex(stringMatch[1])}\\s*\\|\\s*(?:trans|t)\\b`, "i").test(after)) return null;
  return { kind: "translation", prefix: stringMatch[2], start: offset - stringMatch[2].length, end: offset };
}

/** Resolves a completed Symfony reference string for Hover, diagnostics and navigation. */
export function getSymfonyReferenceAtOffset(source: string, offset: number): SymfonyReferenceMatch | null {
  let start = offset;
  while (start > 0 && source[start - 1] !== "'" && source[start - 1] !== '"' && source[start - 1] !== "\n") start -= 1;
  if (start === 0 || (source[start - 1] !== "'" && source[start - 1] !== '"')) return null;
  const quote = source[start - 1];
  let end = Math.max(start, offset);
  while (end < source.length && source[end] !== quote && source[end] !== "\n") end += 1;
  if (end >= source.length || source[end] !== quote) return null;
  const before = source.slice(0, start - 1);
  const after = source.slice(end + 1);
  const call = before.match(/\b(path|url|asset|trans|is_granted|controller|importmap)\s*\(\s*$/i);
  let kind: SymfonyReferenceKind | null = call ? functionKind(call[1]) : null;
  if (!kind && /^\s*\|\s*(?:trans|t)\b/i.test(after)) kind = "translation";
  if (!kind && /\bform_theme\s+[^%}]+?\s+(?:with\s+)?(?:\[\s*)?$/i.test(before)) kind = "form";
  return kind ? { kind, prefix: source.slice(start, end), start, end } : null;
}

export function collectSymfonyReferences(source: string): SymfonyReferenceMatch[] {
  const result: SymfonyReferenceMatch[] = [];
  const strings = /(['"])([^'"\r\n]*)\1/g;
  for (const match of source.matchAll(strings)) {
    const start = (match.index ?? 0) + 1;
    const reference = getSymfonyReferenceAtOffset(source, start);
    if (reference && !result.some((item) => item.start === reference.start && item.kind === reference.kind)) result.push(reference);
  }
  return result;
}

export function requiredSymfonyPackages(kind: SymfonyReferenceKind): readonly string[] {
  switch (kind) {
    case "asset": return ["symfony/asset"];
    case "translation": return ["symfony/translation", "symfony/translation-contracts"];
    case "form": return ["symfony/form"];
    case "security": return ["symfony/security-core", "symfony/security-bundle"];
    case "fragment": return ["symfony/http-kernel"];
    case "importmap": return ["symfony/asset-mapper"];
    default: return ["symfony/routing"];
  }
}

function functionKind(name: string): SymfonyReferenceKind {
  switch (name.toLowerCase()) {
    case "asset": return "asset";
    case "trans": return "translation";
    case "is_granted": return "security";
    case "controller": return "fragment";
    case "importmap": return "importmap";
    default: return "route";
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
