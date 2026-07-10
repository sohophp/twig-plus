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
  prefix: string
): string[] {
  return collectTemplateCompletionCandidates(workspacePaths, prefix);
}

export function getTwigDiagnosticsForIntegration(
  source: string,
  workspacePaths: string[] = [],
  currentWorkspacePath?: string
) {
  return analyzeTwigDiagnostics(source, workspacePaths, currentWorkspacePath);
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
  currentWorkspacePath?: string
): string | null {
  return resolveTemplateWorkspacePath(
    workspacePaths,
    referencePath,
    currentWorkspacePath
  );
}
