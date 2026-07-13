import { describe, expect, it } from "vitest";
import { getSymfonyReferenceMatch } from "../src/symfonyReference";

describe("Symfony Twig reference contexts", () => {
  it.each([
    ["{{ path('admin_us|') }}", "route", "admin_us"],
    ["{{ url(\"home|\") }}", "route", "home"],
    ["{{ asset('images/lo|') }}", "asset", "images/lo"],
    ["{{ trans('account.lo|') }}", "translation", "account.lo"],
    ["{{ 'account.lo|'|trans }}", "translation", "account.lo"],
    ["{{ \"account.lo|\" | t }}", "translation", "account.lo"]
  ])("recognizes %s", (fixture, kind, prefix) => {
    const offset = fixture.indexOf("|");
    const source = fixture.replace("|", "");
    expect(getSymfonyReferenceMatch(source, offset)).toMatchObject({ kind, prefix, start: offset - prefix.length, end: offset });
  });

  it.each(["{{ include('partial.twig') }}", "{{ path(route_name) }}", "{{ 'key'|upper }}"])(
    "ignores non-reference strings: %s",
    (source) => expect(getSymfonyReferenceMatch(source, source.indexOf("'") + 2)).toBeNull()
  );
});
