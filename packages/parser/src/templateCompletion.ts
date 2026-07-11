export interface TemplateReferenceMatch {
  directive: "extends" | "include" | "embed" | "import" | "from";
  quote: "'" | "\"";
  prefix: string;
  startOffset: number;
}

export interface TemplateReferenceAtOffset {
  directive: TemplateReferenceMatch["directive"];
  quote: "'" | "\"";
  referencePath: string;
  referenceStart: number;
  referenceEnd: number;
}

export type TemplateReferenceStyle = "relative" | "bundle";

export const DEFAULT_TEMPLATE_ROOTS = [
  "templates",
  "app/Resources/views",
  "src/*/Resources/views"
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

export function getTemplateReferenceAtOffset(
  source: string,
  offset: number
): TemplateReferenceAtOffset | null {
  const referencePattern =
    /\{%\s*(extends|include|embed|import|from)\s+(['"])([^'"]+)\2/gi;

  for (const match of source.matchAll(referencePattern)) {
    const matchStart = match.index ?? 0;
    const [, directive, quote, referencePath] = match;
    const referenceStart =
      matchStart + match[0].length - referencePath.length - 1;
    const referenceEnd = referenceStart + referencePath.length;

    if (offset < referenceStart - 1 || offset > referenceEnd) {
      continue;
    }

    return {
      directive: directive.toLowerCase() as TemplateReferenceMatch["directive"],
      quote: quote as "'" | "\"",
      referencePath,
      referenceStart,
      referenceEnd
    };
  }

  return null;
}

export function mapWorkspaceTemplateToReference(workspacePath: string): string {
  return mapWorkspaceTemplateToReferenceWithRoots(workspacePath);
}

export function mapWorkspaceTemplateToReferenceWithRoots(
  workspacePath: string,
  templateRoots: string[] = DEFAULT_TEMPLATE_ROOTS
): string {
  const normalized = workspacePath.replace(/\\/g, "/");
  const rootInfo = getTemplateRootInfo(normalized, templateRoots);

  if (rootInfo) {
    return rootInfo.relativePath;
  }

  return normalized;
}

export function collectTemplateReferenceAliases(
  workspacePath: string,
  currentWorkspacePath?: string,
  prefix = "",
  templateRoots: string[] = DEFAULT_TEMPLATE_ROOTS
): string[] {
  const normalized = workspacePath.replace(/\\/g, "/");
  const aliases = new Set<string>();
  const relativeReference = mapWorkspaceTemplateToReferenceWithRoots(
    normalized,
    templateRoots
  );

  aliases.add(relativeReference);

  const bundleReference = mapWorkspaceTemplateToBundleReference(normalized);
  if (bundleReference) {
    aliases.add(bundleReference);
  }

  for (const contextualAlias of collectContextualTemplateAliases(
    normalized,
    currentWorkspacePath?.replace(/\\/g, "/"),
    prefix,
    templateRoots
  )) {
    aliases.add(contextualAlias);
  }

  return [...aliases];
}

export function collectTemplateCompletionCandidates(
  workspacePaths: string[],
  prefix: string,
  currentWorkspacePath?: string,
  templateRoots: string[] = DEFAULT_TEMPLATE_ROOTS
): string[] {
  const normalizedPrefix = prefix.replace(/\\/g, "/").toLowerCase();
  const seen = new Set<string>();
  const candidates: string[] = [];

  for (const workspacePath of workspacePaths) {
    for (const referencePath of collectTemplateReferenceAliases(
      workspacePath,
      currentWorkspacePath,
      prefix,
      templateRoots
    )) {
      if (!referencePath.endsWith(".twig")) {
        continue;
      }

      if (!shouldIncludeReferenceForPrefix(referencePath, normalizedPrefix)) {
        continue;
      }

      if (seen.has(referencePath)) {
        continue;
      }

      seen.add(referencePath);
      candidates.push(referencePath);
    }
  }

  return candidates.sort((left, right) => left.localeCompare(right));
}

export function resolveTemplateWorkspacePath(
  workspacePaths: string[],
  referencePath: string,
  currentWorkspacePath?: string,
  templateRoots: string[] = DEFAULT_TEMPLATE_ROOTS
): string | null {
  const normalizedReference = referencePath.replace(/\\/g, "/").toLowerCase();
  const normalizedCurrentPath = currentWorkspacePath?.replace(/\\/g, "/");

  const contextualWorkspacePath = resolveContextualWorkspacePath(
    workspacePaths,
    referencePath,
    normalizedCurrentPath,
    templateRoots
  );
  if (contextualWorkspacePath) {
    return contextualWorkspacePath;
  }

  for (const workspacePath of sortWorkspaceTemplatePaths(workspacePaths, templateRoots)) {
    for (const alias of collectTemplateReferenceAliases(
      workspacePath,
      normalizedCurrentPath,
      referencePath,
      templateRoots
    )) {
      if (alias.toLowerCase() === normalizedReference) {
        return workspacePath.replace(/\\/g, "/");
      }
    }
  }

  return null;
}

function collectContextualTemplateAliases(
  workspacePath: string,
  currentWorkspacePath?: string,
  prefix = "",
  templateRoots: string[] = DEFAULT_TEMPLATE_ROOTS
): string[] {
  if (!currentWorkspacePath) {
    return [];
  }

  const targetRoot = getTemplateRootInfo(workspacePath, templateRoots);
  const currentRoot = getTemplateRootInfo(currentWorkspacePath, templateRoots);

  if (!targetRoot || !currentRoot || targetRoot.rootPath !== currentRoot.rootPath) {
    return [];
  }

  const aliases = new Set<string>();
  const currentDir = getDirname(currentRoot.relativePath);
  const targetDir = getDirname(targetRoot.relativePath);
  const targetBasename = getBasename(targetRoot.relativePath);
  const normalizedPrefix = prefix.replace(/\\/g, "/");

  if (targetDir === currentDir) {
    aliases.add(targetBasename);
  }

  if (normalizedPrefix.startsWith("./") || normalizedPrefix.startsWith("../")) {
    const relativeAlias = toRelativePath(currentDir, targetRoot.relativePath);
    if (relativeAlias) {
      aliases.add(relativeAlias);
    }
  }

  return [...aliases];
}

function resolveContextualWorkspacePath(
  workspacePaths: string[],
  referencePath: string,
  currentWorkspacePath?: string,
  templateRoots: string[] = DEFAULT_TEMPLATE_ROOTS
): string | null {
  if (!currentWorkspacePath || referencePath.includes(":")) {
    return null;
  }

  const currentRoot = getTemplateRootInfo(currentWorkspacePath, templateRoots);
  if (!currentRoot) {
    return null;
  }

  const currentDir = getDirname(currentRoot.relativePath);
  const candidateRelativePath =
    referencePath.startsWith("./") || referencePath.startsWith("../")
      ? normalizeRelativePath(joinPath(currentDir, referencePath))
      : referencePath.includes("/")
        ? null
        : normalizeRelativePath(joinPath(currentDir, referencePath));

  if (!candidateRelativePath) {
    return null;
  }

  const candidateWorkspacePath = `${currentRoot.rootPath}/${candidateRelativePath}`;
  const normalizedCandidate = candidateWorkspacePath.replace(/\\/g, "/");

  return (
    workspacePaths.find(
      (workspacePath) => workspacePath.replace(/\\/g, "/") === normalizedCandidate
    ) ?? null
  );
}

function shouldIncludeReferenceForPrefix(
  referencePath: string,
  normalizedPrefix: string
): boolean {
  if (!normalizedPrefix) {
    return !referencePath.includes(":");
  }

  const usesBundleStyle = normalizedPrefix.includes(":");
  if (usesBundleStyle !== referencePath.includes(":")) {
    return false;
  }

  return referencePath.toLowerCase().startsWith(normalizedPrefix);
}

function mapWorkspaceTemplateToBundleReference(
  workspacePath: string
): string | null {
  const normalized = workspacePath.replace(/\\/g, "/");
  const match = normalized.match(/^src\/([^/]+)\/Resources\/views\/(.+)$/);

  if (!match) {
    return null;
  }

  const [, bundleName, templatePath] = match;
  const pathSegments = templatePath.split("/").filter(Boolean);

  if (pathSegments.length === 0) {
    return null;
  }

  const templateName = pathSegments.pop();
  const namespace = pathSegments.join(":");

  return namespace
    ? `${bundleName}:${namespace}:${templateName}`
    : `${bundleName}::${templateName}`;
}

function getTemplateRootInfo(path: string, templateRoots: string[] = DEFAULT_TEMPLATE_ROOTS): {
  rootPath: string;
  relativePath: string;
} | null {
  const normalized = path.replace(/\\/g, "/");

  for (const root of normalizeTemplateRoots(templateRoots)) {
    const match = matchTemplateRoot(normalized, root);
    if (match) {
      return match;
    }
  }

  return null;
}

function normalizeTemplateRoots(templateRoots: string[]): string[] {
  return (templateRoots.length > 0 ? templateRoots : DEFAULT_TEMPLATE_ROOTS)
    .map((root) => root.replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""))
    .filter(Boolean);
}

function matchTemplateRoot(
  workspacePath: string,
  rootPattern: string
): { rootPath: string; relativePath: string } | null {
  if (!rootPattern.includes("*")) {
    const prefix = `${rootPattern}/`;
    return workspacePath.startsWith(prefix)
      ? {
          rootPath: rootPattern,
          relativePath: workspacePath.slice(prefix.length)
        }
      : null;
  }

  const expression = new RegExp(
    `^(${rootPattern
      .split("*")
      .map(escapeRegExp)
      .join("[^/]+")})/(.+)$`
  );
  const match = workspacePath.match(expression);

  if (!match) {
    return null;
  }

  return {
    rootPath: match[1],
    relativePath: match[2]
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getDirname(path: string): string {
  const lastSlash = path.lastIndexOf("/");
  return lastSlash === -1 ? "" : path.slice(0, lastSlash);
}

function getBasename(path: string): string {
  const lastSlash = path.lastIndexOf("/");
  return lastSlash === -1 ? path : path.slice(lastSlash + 1);
}

function joinPath(left: string, right: string): string {
  return [left, right].filter(Boolean).join("/");
}

function normalizeRelativePath(path: string): string {
  const segments: string[] = [];

  for (const segment of path.split("/")) {
    if (!segment || segment === ".") {
      continue;
    }

    if (segment === "..") {
      segments.pop();
      continue;
    }

    segments.push(segment);
  }

  return segments.join("/");
}

function toRelativePath(fromDir: string, toPath: string): string {
  const fromSegments = fromDir ? fromDir.split("/").filter(Boolean) : [];
  const toSegments = toPath.split("/").filter(Boolean);
  let commonLength = 0;

  while (
    commonLength < fromSegments.length &&
    commonLength < toSegments.length &&
    fromSegments[commonLength] === toSegments[commonLength]
  ) {
    commonLength += 1;
  }

  const upSegments = new Array(fromSegments.length - commonLength).fill("..");
  const downSegments = toSegments.slice(commonLength);
  const combined = [...upSegments, ...downSegments];

  if (combined.length === 0) {
    return getBasename(toPath);
  }

  const relativePath = combined.join("/");
  return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
}

function sortWorkspaceTemplatePaths(
  paths: string[],
  templateRoots: string[] = DEFAULT_TEMPLATE_ROOTS
): string[] {
  return [...paths].sort((left, right) => {
    const priorityDelta =
      getTemplateRootPriority(left, templateRoots) -
      getTemplateRootPriority(right, templateRoots);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return left.localeCompare(right);
  });
}

function getTemplateRootPriority(
  path: string,
  templateRoots: string[] = DEFAULT_TEMPLATE_ROOTS
): number {
  const normalized = path.replace(/\\/g, "/");
  const roots = normalizeTemplateRoots(templateRoots);

  for (const [index, root] of roots.entries()) {
    if (matchTemplateRoot(normalized, root)) {
      return index;
    }
  }

  return roots.length;
}
