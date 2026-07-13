<?php

declare(strict_types=1);

if ($argc < 2) {
    fwrite(STDERR, "Usage: verify-version-boundaries.php <version-directory>\n");
    exit(2);
}
$directory = realpath($argv[1]);
if (!$directory || !is_file($directory.'/vendor/autoload.php')) {
    fwrite(STDERR, "Missing installed version oracle: ".$argv[1]."\n");
    exit(2);
}
require $directory.'/vendor/autoload.php';

$environment = new Twig\Environment(new Twig\Loader\ArrayLoader());
$manifest = json_decode(file_get_contents(__DIR__.'/version-boundaries.json'), true);
$failures = array();
foreach ($manifest['cases'] as $case) {
    $accepted = true;
    try {
        $source = new Twig\Source($case['source'], $case['id'].'.twig');
        $environment->parse($environment->tokenize($source));
    } catch (Twig\Error\SyntaxError $error) {
        $accepted = false;
    }
    $expected = version_compare(Twig\Environment::VERSION, $case['minVersion'], '>=');
    if ($accepted !== $expected) {
        $failures[] = array('id' => $case['id'], 'expected' => $expected, 'accepted' => $accepted);
    }
}
echo json_encode(array('twig' => Twig\Environment::VERSION, 'cases' => count($manifest['cases']), 'failures' => $failures), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES).PHP_EOL;
exit($failures ? 1 : 0);
