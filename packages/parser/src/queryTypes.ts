import type { TwigTokenType } from "./twigTokenizer";

export interface SourceRange {
  start: number;
  end: number;
}

export type TwigStructureSymbolKind = "block" | "macro" | "set";

export interface TwigBlockSymbolData extends SourceRange {
  kind: TwigStructureSymbolKind;
  name: string;
  nameStart: number;
  nameEnd: number;
  bodyStart: number;
}

export interface TwigMacroImport {
  kind: "import" | "from";
  template: string;
  exportedName: string;
  localName: string;
  alias: string | null;
}

export interface TwigMacroReference {
  alias: string | null;
  kind: "import" | "from" | "self";
  name: string;
}

export type TwigTokenContextKind = TwigTokenType | "html";

export interface TwigTokenContext {
  kind: TwigTokenContextKind;
  stringLike: boolean;
  hashKeyLike: boolean;
}

export type HybridQueryFailureReason =
  | "cancelled"
  | "hybrid-parse-error"
  | "hybrid-validation-error"
  | "hybrid-error";

export interface HybridQueryFailure {
  query: "format" | "range-format" | "diagnostics" | "navigation" | "selection" | "symbols" | "context";
  reason: HybridQueryFailureReason;
  range: SourceRange;
  message?: string;
}
