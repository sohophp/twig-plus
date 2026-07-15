const COMPLETE_TWIG_SEGMENT = /\{\{[-~]?[\s\S]*?[-~]?\}\}|\{%[-~]?[\s\S]*?[-~]?%\}|\{#[-~]?[\s\S]*?[-~]?#\}/g;

/** Hide complete Twig syntax before looking for structural HTML tags. */
export function maskCompleteTwigSegments(value: string): string {
  return value.replace(COMPLETE_TWIG_SEGMENT, (segment) => " ".repeat(segment.length));
}
