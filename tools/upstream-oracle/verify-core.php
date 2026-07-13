<?php

declare(strict_types=1);

use Twig\Environment;
use Twig\Loader\ArrayLoader;
use Twig\Source;

require __DIR__.'/core/vendor/autoload.php';

$environment = new Environment(new ArrayLoader());
$samples = [
    '{{ user is defined and user.active }}',
    '{{ user?.profile ?? fallback }}',
    '{{ values|map((value, key) => key ~ value) }}',
    '{{ [first, ...rest] }}',
    '{% if enabled %}yes{% elseif pending %}wait{% else %}no{% endif %}',
    '{% for key, value in values %}{{ key }}={{ value }}{% else %}empty{% endfor %}',
    '{% set first, second = values[0], values[1] %}{{ first }}',
    '{% macro field(name, type = "text") %}{{ name }}{% endmacro %}',
    '{% with {name: "Twig"} %}{{ name }}{% endwith %}',
];

foreach ($samples as $index => $sample) {
    $environment->parse($environment->tokenize(new Source($sample, 'oracle-'.$index.'.twig')));
}

echo json_encode([
    'php' => PHP_VERSION,
    'twig' => Environment::VERSION,
    'samples' => count($samples),
], JSON_THROW_ON_ERROR).PHP_EOL;
