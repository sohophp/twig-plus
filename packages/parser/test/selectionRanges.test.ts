import { describe, expect, it } from "vitest";

import { collectSelectionRanges } from "../src/selectionRanges";

describe("collectSelectionRanges", () => {
  it("expands through twig output, html elements, and surrounding twig block", () => {
    const source = [
      "{% block content %}",
      "    <div><span>{{ user.name }}</span></div>",
      "{% endblock %}"
    ].join("\n");
    const offset = source.indexOf("name");

    expect(
      collectSelectionRanges(source, offset).map((range) =>
        source.slice(range.start, range.end)
      )
    ).toEqual([
      "name",
      "user.name",
      "{{ user.name }}",
      "<span>{{ user.name }}</span>",
      "<div><span>{{ user.name }}</span></div>",
      source
    ]);
  });

  it("expands inside twig tag content and then to the full tag", () => {
    const source = "{% if user.active %}\n{% endif %}";
    const offset = source.indexOf("active");

    expect(
      collectSelectionRanges(source, offset).map((range) =>
        source.slice(range.start, range.end)
      )
    ).toEqual([
      "active",
      "if user.active",
      "{% if user.active %}",
      source
    ]);
  });

  it("expands through a macro body before the surrounding document", () => {
    const source = [
      "{% macro card(user) %}",
      "  <div>{{ user.name }}</div>",
      "{% endmacro %}"
    ].join("\n");
    const offset = source.indexOf("name");

    expect(
      collectSelectionRanges(source, offset).map((range) =>
        source.slice(range.start, range.end)
      )
    ).toContain([
      "<div>{{ user.name }}</div>",
      "{% macro card(user) %}\n  <div>{{ user.name }}</div>\n{% endmacro %}"
    ][1]);
  });
});
