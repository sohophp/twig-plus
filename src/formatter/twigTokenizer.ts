export type TwigTokenType = "output" | "tag" | "comment";

export interface TwigToken {
  type: TwigTokenType;
  raw: string;
  inner: string;
  start: number;
  end: number;
}

const TOKEN_PATTERN = /(\{\{[-~]?[\s\S]*?[-~]?\}\}|\{%-?[\s\S]*?-?%\}|\{#-?[\s\S]*?-?#\})/g;

export function tokenizeTwig(source: string): TwigToken[] {
  const tokens: TwigToken[] = [];

  for (const match of source.matchAll(TOKEN_PATTERN)) {
    const raw = match[0];
    const start = match.index ?? 0;
    const end = start + raw.length;

    let type: TwigTokenType = "tag";
    let inner = raw.slice(2, -2);

    if (raw.startsWith("{{")) {
      type = "output";
    } else if (raw.startsWith("{#")) {
      type = "comment";
      inner = raw.slice(2, -2);
    }

    tokens.push({
      type,
      raw,
      inner,
      start,
      end
    });
  }

  return tokens;
}
