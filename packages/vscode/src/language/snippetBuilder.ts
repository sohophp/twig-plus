import type { StaticCompletionEntry } from "./completionData";

const CLOSING_TAGS: Record<string, string> = {
  if: "endif",
  for: "endfor",
  block: "endblock",
  embed: "endembed",
  macro: "endmacro",
  apply: "endapply",
  filter: "endfilter",
  autoescape: "endautoescape",
  with: "endwith",
  spaceless: "endspaceless",
  set: "endset"
};

export function buildTwigTagInsertText(
  entry: StaticCompletionEntry,
  autoInsertClosingTag: boolean,
  baseIndent: string,
  indentUnit: string
): string {
  if (!entry.insertText) {
    return entry.label;
  }

  if (!autoInsertClosingTag) {
    return entry.insertText;
  }

  const closingTag = CLOSING_TAGS[entry.label];
  if (!closingTag) {
    return entry.insertText;
  }

  return [
    `${entry.insertText} %}`,
    `${baseIndent}${indentUnit}$0`,
    `${baseIndent}{% ${closingTag}`
  ].join("\n");
}
