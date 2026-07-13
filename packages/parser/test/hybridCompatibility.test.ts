import { describe, expect, it, vi } from "vitest";
import {
  analyzeCompatibleDiagnostics,
  collectCompatibleSelectionRanges,
  collectCompatibleStructureSymbols,
  getCompatibleCompletionContext,
  getCompatibleContextAtOffset
} from "../src/hybridCompatibility";
import {
  collectCompatibleBlockSymbols,
  collectCompatibleMacroImports,
  getCompatibleBlockReferenceAtOffset,
  getCompatibleExtendsTemplateReference,
  getCompatibleMacroReferenceAtOffset
} from "../src/hybridCompatibility";

describe("hybrid compatibility queries", () => {
  const source = `{% block body %}\n<div class="{{ kind }}">{{ value }}</div>\n{% endblock %}`;

  it("uses verified hybrid queries by default", () => {
    const engine = "hybrid" as const;
    expect(collectCompatibleStructureSymbols(source, { engine })).toEqual(collectCompatibleStructureSymbols(source));
    expect(collectCompatibleSelectionRanges(source, source.indexOf("value"), { engine })).toEqual(
      collectCompatibleSelectionRanges(source, source.indexOf("value"))
    );
    expect(getCompatibleContextAtOffset(source, source.indexOf("kind"), { engine })).toEqual(
      getCompatibleContextAtOffset(source, source.indexOf("kind"))
    );
    expect(getCompatibleCompletionContext(source, source.length, { engine })).toEqual(
      getCompatibleCompletionContext(source, source.length)
    );
    expect(analyzeCompatibleDiagnostics(source, [], undefined, undefined, { engine })).toEqual(
      analyzeCompatibleDiagnostics(source)
    );
  });

  it("keeps the legacy parser available as an explicit fatal-error fallback", () => {
    expect(collectCompatibleStructureSymbols(source, { engine: "legacy" })).not.toEqual([]);
    expect(collectCompatibleSelectionRanges(source, source.indexOf("value"), { engine: "legacy" })).not.toEqual([]);
  });

  it("does not report differences for equivalent shadow queries", () => {
    const onDifference = vi.fn();
    collectCompatibleStructureSymbols(source, { engine: "hybrid-shadow", onDifference });
    expect(onDifference).not.toHaveBeenCalled();
  });

  it("keeps incomplete lossless documents on Hybrid without fatal fallback", () => {
    const differences: Array<{ fallbackUsed?: boolean }> = [];
    for (const incomplete of ["{% if user is defined %}", "<div class=\"hero\"", "{{ user?.profile ??"] ) {
      collectCompatibleStructureSymbols(incomplete, { onDifference: (difference) => differences.push(difference) });
      collectCompatibleSelectionRanges(incomplete, Math.max(0, incomplete.length - 1), { onDifference: (difference) => differences.push(difference) });
      analyzeCompatibleDiagnostics(incomplete, [], undefined, undefined, { onDifference: (difference) => differences.push(difference) });
    }
    expect(differences.filter((difference) => difference.fallbackUsed)).toEqual([]);
  });

  it("keeps native block and macro navigation equivalent", () => {
    const navigationSource = `{% extends 'base.html.twig' %}\n{% import 'forms.twig' as forms %}\n{% from 'forms.twig' import input as field %}\n{% block body %}{{ forms.input() }} {{ field() }}{% endblock %}`;
    for (const engine of ["hybrid-shadow", "hybrid"] as const) {
      const options = { engine };
      expect(collectCompatibleBlockSymbols(navigationSource, options)).toEqual(collectCompatibleBlockSymbols(navigationSource));
      expect(collectCompatibleMacroImports(navigationSource, options)).toEqual(collectCompatibleMacroImports(navigationSource));
      expect(getCompatibleExtendsTemplateReference(navigationSource, options)).toBe("base.html.twig");
      expect(getCompatibleBlockReferenceAtOffset(navigationSource, navigationSource.indexOf("body"), options)).toEqual(
        getCompatibleBlockReferenceAtOffset(navigationSource, navigationSource.indexOf("body"))
      );
      expect(getCompatibleMacroReferenceAtOffset(navigationSource, navigationSource.indexOf("forms.input") + 7, options)).toEqual(
        getCompatibleMacroReferenceAtOffset(navigationSource, navigationSource.indexOf("forms.input") + 7)
      );
    }
  });
});
