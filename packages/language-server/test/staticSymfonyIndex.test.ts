import { describe, expect, it } from "vitest";
import { parseLiteralImportmap, parseRouteXml, parseRouteYaml, parseSecurityYaml, parseTranslationJson, parseTranslationXliff, parseTranslationYaml, parseTwigConfigYaml } from "../src/staticSymfonyIndex";

describe("safe static Symfony indexes", () => {
  it("reads YAML and XML routes without evaluating configuration", () => {
    expect(parseRouteYaml("admin_users:\n  path: /admin\n  controller: 'App\\Controller\\AdminController::index'\nresource: routes/admin.yaml").map((item) => [item.kind, item.name])).toEqual([
      ["route", "admin_users"], ["fragment", "App\\Controller\\AdminController::index"]
    ]);
    expect(parseRouteXml(`<routes><route id="home" path="/"><default key="_controller">App\\Controller\\HomeController::index</default></route></routes>`).map((item) => [item.kind, item.name])).toEqual([
      ["route", "home"], ["fragment", "App\\Controller\\HomeController::index"]
    ]);
  });
  it("reads YAML, JSON and XLIFF translation keys", () => {
    expect(parseTranslationYaml("account:\n  login: Log in", "messages.yaml").map((item) => item.name)).toEqual(["account.login"]);
    expect(parseTranslationJson('{"navigation.home":"Home"}', "messages.json").map((item) => item.name)).toEqual(["navigation.home"]);
    expect(parseTranslationXliff(`<trans-unit id="account.logout"><source>Logout</source></trans-unit>`, "messages.xlf").map((item) => item.name)).toEqual(["account.logout"]);
  });
  it("accepts only literal importmap arrays and rejects executable PHP", () => {
    expect(parseLiteralImportmap("<?php return ['app' => ['path' => './assets/app.js']];").map((item) => item.name)).toEqual(["app"]);
    expect(parseLiteralImportmap("<?php return require __DIR__.'/dynamic.php';")).toEqual([]);
  });
  it("reads only literal security roles and configured form themes", () => {
    expect(parseSecurityYaml("security:\n  role_hierarchy:\n    ROLE_ADMIN: [ROLE_USER, ROLE_ALLOWED_TO_SWITCH]\n  providers: {}\n").map((item) => item.name)).toEqual([
      "ROLE_ADMIN", "ROLE_USER", "ROLE_ALLOWED_TO_SWITCH"
    ]);
    expect(parseTwigConfigYaml("twig:\n  form_themes:\n    - 'forms/theme.html.twig'\n  globals: {}\n").map((item) => item.name)).toEqual(["forms/theme.html.twig"]);
  });
});
