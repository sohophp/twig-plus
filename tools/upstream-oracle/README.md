# TwigPlus upstream oracle

This directory is development-only. It pins official Twig and Symfony packages and exports their registered language facts without loading any application or workspace PHP code.

`versions/` contains isolated Twig 3.0/3.8/3.12/3.15/3.21/3.23/3.26/3.28 locks. Historical vulnerable releases are never runtime dependencies; Composer advisory blocking is disabled only inside those oracle projects so CI can compare their grammar safely.

`version-fact-exceptions.json` is the reviewed boundary between registered runtime facts and user-facing language syntax. Every exception requires a reason; the checker rejects any other Language Spec/oracle drift.

`symfony/` contains the Symfony 6.4, 7.4 and 8.1 source-oracle projects. Generate their locks and committed snapshots with:

Every lock pins split components independently because Symfony components do not necessarily publish identical patch versions. The 8.1 oracle fixes Twig Bridge at 8.1.1 and resolves compatible 8.x component releases; the committed lock is the reproducibility boundary.

```bash
for dir in tools/upstream-oracle/symfony/*; do php84 /usr/local/bin/composer update --working-dir "$dir" --no-interaction --prefer-dist --no-progress; done
php84 tools/upstream-oracle/export-symfony.php tools/upstream-oracle/symfony/6.4 packages/language-spec/src/generated/symfony/symfony-6.4.json
php84 tools/upstream-oracle/export-symfony.php tools/upstream-oracle/symfony/7.4 packages/language-spec/src/generated/symfony/symfony-7.4.json
php84 tools/upstream-oracle/export-symfony.php tools/upstream-oracle/symfony/8.1 packages/language-spec/src/generated/symfony/symfony-8.1.json
```

```bash
php84 /usr/local/bin/composer install --working-dir tools/upstream-oracle
php84 tools/upstream-oracle/export.php packages/language-spec/src/generated/upstream-runtime.json
```

The extension never invokes this exporter. Normal Node builds consume the checked-in JSON snapshot.

`npm run upstream-oracle:symfony` validates package ownership, duplicate facts, and tracked 6.4/7.4/8.1 callable boundaries.
