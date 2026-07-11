import { formatTwig, type FormatterOptions } from "@twig-plus/formatter";
import {
  analyzeTwigDiagnostics,
  collectSelectionRanges,
  collectTemplateCompletionCandidates,
  resolveTemplateWorkspacePath
} from "@twig-plus/parser";

export async function formatTwigForIntegration(
  source: string,
  options: FormatterOptions
): Promise<string> {
  return formatTwig(source, options);
}

export function getTemplateCompletionsForIntegration(
  workspacePaths: string[],
  prefix: string,
  currentWorkspacePath?: string,
  templateRoots?: string[]
): string[] {
  return collectTemplateCompletionCandidates(
    workspacePaths,
    prefix,
    currentWorkspacePath,
    templateRoots
  );
}

export function getTwigDiagnosticsForIntegration(
  source: string,
  workspacePaths: string[] = [],
  currentWorkspacePath?: string,
  templateRoots?: string[]
) {
  return analyzeTwigDiagnostics(
    source,
    workspacePaths,
    currentWorkspacePath,
    templateRoots
  );
}

export function getSelectionRangesForIntegration(
  source: string,
  offset: number
): string[] {
  return collectSelectionRanges(source, offset).map((range) =>
    source.slice(range.start, range.end)
  );
}

export function resolveTemplatePathForIntegration(
  workspacePaths: string[],
  referencePath: string,
  currentWorkspacePath?: string,
  templateRoots?: string[]
): string | null {
  return resolveTemplateWorkspacePath(
    workspacePaths,
    referencePath,
    currentWorkspacePath,
    templateRoots
  );
}
