import {
  getCompletionSortScore,
  type StaticCompletionEntry
} from "./completionData";

export function matchesCompletionQuery(label: string, query: string): boolean {
  if (!query) {
    return true;
  }

  return label.toLowerCase().includes(query.toLowerCase());
}

export function sortCompletionEntries(
  entries: StaticCompletionEntry[],
  query: string
): StaticCompletionEntry[] {
  return [...entries].sort((left, right) =>
    getCompletionSortScore(
      left.label,
      query,
      left.priority ?? 0
    ).localeCompare(
      getCompletionSortScore(
        right.label,
        query,
        right.priority ?? 0
      )
    )
  );
}
