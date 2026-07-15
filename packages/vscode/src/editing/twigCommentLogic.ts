export function unwrapTwigComment(line: string): string | null {
  const leading = line.match(/^\s*/)?.[0] ?? "";
  const trailing = line.match(/\s*$/)?.[0] ?? "";
  const contentEnd = line.length - trailing.length;
  const content = line.slice(leading.length, contentEnd);
  if (!content.startsWith("{#") || !content.endsWith("#}")) return null;

  const openingLength = /^\{#[-~]/.test(content) ? 3 : 2;
  const closingLength = /[-~]#\}$/.test(content) ? 3 : 2;
  let inner = content.slice(openingLength, -closingLength);
  if (inner.startsWith(" ")) inner = inner.slice(1);
  if (inner.endsWith(" ")) inner = inner.slice(0, -1);
  return leading + inner + trailing;
}

export function wrapTwigComment(line: string): string {
  if (!line.trim() || unwrapTwigComment(line) !== null) return line;
  const leading = line.match(/^\s*/)?.[0] ?? "";
  const content = line.slice(leading.length);
  return `${leading}{# ${content} #}`;
}
