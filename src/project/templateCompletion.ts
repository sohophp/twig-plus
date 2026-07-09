export interface TemplateReferenceMatch {
  directive: "extends" | "include" | "embed" | "import" | "from";
  quote: "'" | "\"";
  prefix: string;
  startOffset: number;
}

const TEMPLATE_ROOT_PATTERNS = [
  /^templates\//,
  /^app\/Resources\/views\//,
  /^src\/[^/]+\/Resources\/views\//
];

export function getTemplateReferenceMatch(
  linePrefix: string
): TemplateReferenceMatch | null {
  const match = linePrefix.match(
    /\{%\s*(extends|include|embed|import|from)\s+(['"])([^'"]*)$/i
  );

  if (!match) {
    return null;
  }

  const [, directive, quote, prefix] = match;

  return {
    directive: directive.toLowerCase() as TemplateReferenceMatch["directive"],
    quote: quote as "'" | "\"",
    prefix,
    startOffset: linePrefix.length - prefix.length
  };
}

export function mapWorkspaceTemplateToReference(workspacePath: string): string {
  const normalized = workspacePath.replace(/\\/g, "/");

  for (const rootPattern of TEMPLATE_ROOT_PATTERNS) {
    if (rootPattern.test(normalized)) {
      return normalized.replace(rootPattern, "");
    }
  }

  return normalized;
}

export function collectTemplateCompletionCandidates(
  workspacePaths: string[],
  prefix: string
): string[] {
  const normalizedPrefix = prefix.replace(/\\/g, "/").toLowerCase();
  const seen = new Set<string>();
  const candidates: string[] = [];

  for (const workspacePath of workspacePaths) {
    const referencePath = mapWorkspaceTemplateToReference(workspacePath);
    if (!referencePath.endsWith(".twig")) {
      continue;
    }

    const lowerReference = referencePath.toLowerCase();
    if (normalizedPrefix && !lowerReference.startsWith(normalizedPrefix)) {
      continue;
    }

    if (seen.has(referencePath)) {
      continue;
    }

    seen.add(referencePath);
    candidates.push(referencePath);
  }

  return candidates.sort((left, right) => left.localeCompare(right));
}

export function resolveTemplateWorkspacePath(
  workspacePaths: string[],
  referencePath: string
): string | null {
  const normalizedReference = referencePath.replace(/\\/g, "/").toLowerCase();

  for (const workspacePath of sortWorkspaceTemplatePaths(workspacePaths)) {
    const mappedReference = mapWorkspaceTemplateToReference(workspacePath).toLowerCase();
    if (mappedReference === normalizedReference) {
      return workspacePath.replace(/\\/g, "/");
    }
  }

  return null;
}

function sortWorkspaceTemplatePaths(paths: string[]): string[] {
  return [...paths].sort((left, right) => {
    const priorityDelta = getTemplateRootPriority(left) - getTemplateRootPriority(right);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return left.localeCompare(right);
  });
}

function getTemplateRootPriority(path: string): number {
  const normalized = path.replace(/\\/g, "/");

  if (/^templates\//.test(normalized)) {
    return 0;
  }

  if (/^app\/Resources\/views\//.test(normalized)) {
    return 1;
  }

  if (/^src\/[^/]+\/Resources\/views\//.test(normalized)) {
    return 2;
  }

  return 3;
}
