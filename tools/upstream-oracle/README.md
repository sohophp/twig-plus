# TwigPlus upstream oracle

This directory is development-only. It pins official Twig and Symfony packages and exports their registered language facts without loading any application or workspace PHP code.

```bash
php84 /usr/local/bin/composer install --working-dir tools/upstream-oracle
php84 tools/upstream-oracle/export.php packages/language-spec/src/generated/upstream-runtime.json
```

The extension never invokes this exporter. Normal Node builds consume the checked-in JSON snapshot.
