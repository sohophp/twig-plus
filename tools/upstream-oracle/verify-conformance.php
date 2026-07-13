<?php

declare(strict_types=1);

use Twig\Environment;
use Twig\Error\SyntaxError;
use Twig\Extension\DebugExtension;
use Twig\Extension\SandboxExtension;
use Twig\Extension\StringLoaderExtension;
use Twig\Loader\ArrayLoader;
use Twig\Sandbox\SecurityPolicy;
use Twig\Source;

require __DIR__.'/vendor/autoload.php';

$loader = new ArrayLoader([
    'layout.twig' => '{% block content %}{% endblock %}',
    'blocks.twig' => '{% block content %}{% endblock %}',
    'macros.twig' => '{% macro field(name) %}{{ name }}{% endmacro %}',
    'partial.twig' => '{{ name|default("partial") }}',
]);
$environment = new Environment($loader);
$environment->addExtension(new DebugExtension());
$environment->addExtension(new SandboxExtension(new SecurityPolicy(
    ['include'], ['default'], [], [], []
)));
$environment->addExtension(new StringLoaderExtension());
$environment->addExtension(new Twig\Extra\Cache\CacheExtension());

$corpus = json_decode(file_get_contents(__DIR__.'/conformance.json'), true, flags: JSON_THROW_ON_ERROR);
$results = [];
$failures = [];
foreach ($corpus['cases'] as $case) {
    $accepted = true;
    $message = null;
    try {
        $environment->parse($environment->tokenize(new Source($case['source'], $case['id'].'.twig')));
    } catch (SyntaxError $error) {
        $accepted = false;
        $message = $error->getRawMessage();
    }
    $results[] = ['id' => $case['id'], 'expected' => $case['valid'], 'accepted' => $accepted, 'message' => $message];
    if ($accepted !== $case['valid']) $failures[] = end($results);
}

echo json_encode(['twig' => Environment::VERSION, 'cases' => count($results), 'failures' => $failures], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR).PHP_EOL;
exit($failures ? 1 : 0);
