export function parseTwigExtensionGlobals(source: string): string[] {
  if (!/implements[^{;]*\bGlobalsInterface\b/.test(source)) return [];
  const method = source.search(/\bfunction\s+getGlobals\s*\([^)]*\)[^{]*\{/);
  if (method < 0) return [];
  const returnArray = source.slice(method).match(/\breturn\s*\[/);
  if (!returnArray || returnArray.index === undefined) return [];
  const start = method + returnArray.index + returnArray[0].length;
  const end = findArrayEnd(source, start);
  if (end < 0) return [];
  return [...source.slice(start, end).matchAll(/(['"])([A-Za-z_][A-Za-z0-9_]*)\1\s*=>/g)]
    .map((match) => match[2])
    .filter((name, index, all) => all.indexOf(name) === index);
}

function findArrayEnd(source: string, start: number): number {
  let depth = 1;
  let quote: "'" | '"' | null = null;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"') { quote = character; continue; }
    if (character === "[") depth += 1;
    else if (character === "]" && --depth === 0) return index;
  }
  return -1;
}
