import { describe, expect, it } from "vitest";
import { collectSymfonyReferences, getSymfonyReferenceAtOffset, getSymfonyReferenceMatch, requiredSymfonyPackages } from "../src/symfonyReference";

describe("Symfony Twig reference contexts", () => {
  it.each([
    ["{{ path('admin_us|') }}", "route", "admin_us"],
    ["{{ url(\"home|\") }}", "route", "home"],
    ["{{ asset('images/lo|') }}", "asset", "images/lo"],
    ["{{ trans('account.lo|') }}", "translation", "account.lo"],
    ["{{ 'account.lo|'|trans }}", "translation", "account.lo"],
    ["{{ \"account.lo|\" | t }}", "translation", "account.lo"],
    ["{{ is_granted('ROLE_AD|') }}", "security", "ROLE_AD"],
    ["{{ controller('App\\\\Controller\\\\Dash|') }}", "fragment", "App\\\\Controller\\\\Dash"],
    ["{{ importmap('ad|') }}", "importmap", "ad"],
    ["{% form_theme form with ['forms/the|'] %}", "form", "forms/the"]
  ])("recognizes %s", (fixture, kind, prefix) => {
    const offset = fixture.indexOf("|");
    const source = fixture.replace("|", "");
    expect(getSymfonyReferenceMatch(source, offset)).toMatchObject({ kind, prefix, start: offset - prefix.length, end: offset });
  });

  it.each(["{{ include('partial.twig') }}", "{{ path(route_name) }}", "{{ 'key'|upper }}"])(
    "ignores non-reference strings: %s",
    (source) => expect(getSymfonyReferenceMatch(source, source.indexOf("'") + 2)).toBeNull()
  );

  it("resolves completed references for Hover, diagnostics and navigation", () => {
    const source = "{{ path('admin_users') }} {{ is_granted('ROLE_ADMIN') }} {{ importmap('app') }}";
    expect(getSymfonyReferenceAtOffset(source, source.indexOf("admin_users") + 2)).toMatchObject({ kind: "route", prefix: "admin_users" });
    expect(collectSymfonyReferences(source).map(({ kind, prefix }) => [kind, prefix])).toEqual([
      ["route", "admin_users"], ["security", "ROLE_ADMIN"], ["importmap", "app"]
    ]);
  });

  it("maps reference kinds to their optional Symfony components", () => {
    expect(requiredSymfonyPackages("form")).toContain("symfony/form");
    expect(requiredSymfonyPackages("security")).toContain("symfony/security-core");
    expect(requiredSymfonyPackages("importmap")).toContain("symfony/asset-mapper");
  });
});
