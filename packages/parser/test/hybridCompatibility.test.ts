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

  it.each(["legacy", "hybrid-shadow", "hybrid"] as const)("preserves query results in %s mode", (engine) => {
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

  it("does not report differences for equivalent shadow queries", () => {
    const onDifference = vi.fn();
    collectCompatibleStructureSymbols(source, { engine: "hybrid-shadow", onDifference });
    expect(onDifference).not.toHaveBeenCalled();
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
