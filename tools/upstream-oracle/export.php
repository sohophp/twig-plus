<?php

declare(strict_types=1);

use Twig\Environment;
use Twig\Extension\AbstractExtension;
use Twig\Extension\ExtensionInterface;
use Twig\Loader\ArrayLoader;

require __DIR__.'/vendor/autoload.php';

$environment = new Environment(new ArrayLoader());
$extensions = [
    new Twig\Extension\DebugExtension(),
    new Twig\Extension\SandboxExtension(new Twig\Sandbox\SecurityPolicy()),
    new Twig\Extension\StringLoaderExtension(),
    new Twig\Extra\Cache\CacheExtension(),
    new Twig\Extra\CssInliner\CssInlinerExtension(),
    new Twig\Extra\Html\HtmlExtension(),
    new Twig\Extra\Inky\InkyExtension(),
    new Twig\Extra\Intl\IntlExtension(),
    new Twig\Extra\Markdown\MarkdownExtension(),
    new Twig\Extra\String\StringExtension(),
];
foreach ($extensions as $extension) {
    $environment->addExtension($extension);
}

$facts = [
    'schemaVersion' => 1,
    'generatedBy' => 'tools/upstream-oracle/export.php',
    'twig' => [
        'version' => Environment::VERSION,
        'tag' => 'v3.28.0',
        'commit' => '762a989bf2f1a54939fa7da33065beba4ee46e3d',
    ],
    'symfony' => [
        'version' => '8.1.1',
        'tag' => 'v8.1.1',
        'commit' => '12cba50951f46635e6a692c66aa5d8ed7a189302',
    ],
    'tags' => exportTags($environment),
    'callables' => [
        'filter' => exportCallables($environment->getFilters()),
        'function' => exportCallables($environment->getFunctions()),
        'test' => exportCallables($environment->getTests()),
    ],
    'operators' => exportOperators($environment),
    'extraExtensions' => array_map(static fn (ExtensionInterface $extension): string => $extension::class, $extensions),
];

$json = json_encode($facts, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR)."\n";
$output = $argv[1] ?? null;
if ($output) {
    file_put_contents($output, $json);
} else {
    echo $json;
}

/** @return list<array{name: string, class: string, alwaysAllowedInSandbox: bool|null}> */
function exportTags(Environment $environment): array
{
    $result = [];
    foreach ($environment->getTokenParsers() as $parser) {
        $result[] = [
            'name' => $parser->getTag(),
            'class' => $parser::class,
            'alwaysAllowedInSandbox' => method_exists($parser, 'isAlwaysAllowedInSandbox') ? $parser->isAlwaysAllowedInSandbox() : null,
        ];
    }
    usort($result, static fn (array $a, array $b): int => $a['name'] <=> $b['name']);
    return $result;
}

/** @param iterable<object> $callables
 *  @return list<array{name: string, class: string, signature: string|null, deprecated: bool, aliases: list<string>, alwaysAllowedInSandbox: bool|null}>
 */
function exportCallables(iterable $callables): array
{
    $result = [];
    foreach ($callables as $callable) {
        $result[] = [
            'name' => $callable->getName(),
            'class' => $callable::class,
            'signature' => reflectCallable($callable->getCallable()),
            'deprecated' => method_exists($callable, 'isDeprecated') && $callable->isDeprecated(),
            'aliases' => method_exists($callable, 'getAliases') ? array_values($callable->getAliases()) : [],
            'alwaysAllowedInSandbox' => method_exists($callable, 'isAlwaysAllowedInSandbox') ? $callable->isAlwaysAllowedInSandbox() : null,
        ];
    }
    usort($result, static fn (array $a, array $b): int => $a['name'] <=> $b['name']);
    return $result;
}

/** @return list<array{name: string, class: string, precedence: int|null, associativity: string|null, aliases: list<string>}> */
function exportOperators(Environment $environment): array
{
    $registry = $environment->getExpressionParsers();
    $reflection = new ReflectionObject($registry);
    foreach (['getExpressionParsers', 'getParsers'] as $method) {
        if ($reflection->hasMethod($method)) {
            $parsers = $registry->{$method}();
            return normalizeOperators($parsers);
        }
    }
    foreach ($reflection->getProperties() as $property) {
        $property->setAccessible(true);
        $value = $property->getValue($registry);
        if ($property->getName() === 'parsersByName' && is_array($value)) {
            return normalizeOperators(flattenObjects($value));
        }
    }
    return [];
}

/** @return list<object> */
function flattenObjects(array $values): array
{
    $objects = [];
    $seen = [];
    array_walk_recursive($values, static function (mixed $value) use (&$objects, &$seen): void {
        if (!is_object($value)) return;
        $id = spl_object_id($value);
        if (isset($seen[$id])) return;
        $seen[$id] = true;
        $objects[] = $value;
    });
    return $objects;
}

/** @param iterable<object> $parsers */
function normalizeOperators(iterable $parsers): array
{
    $result = [];
    foreach ($parsers as $parser) {
        if (!method_exists($parser, 'getName')) continue;
        $associativity = method_exists($parser, 'getAssociativity') ? $parser->getAssociativity() : null;
        $result[] = [
            'name' => $parser->getName(),
            'class' => $parser::class,
            'precedence' => method_exists($parser, 'getPrecedence') ? $parser->getPrecedence() : null,
            'associativity' => is_object($associativity) && property_exists($associativity, 'name') ? strtolower($associativity->name) : null,
            'aliases' => method_exists($parser, 'getAliases') ? array_values($parser->getAliases()) : [],
        ];
    }
    usort($result, static fn (array $a, array $b): int => $a['name'] <=> $b['name']);
    return $result;
}

function reflectCallable(mixed $callable): ?string
{
    try {
        if (is_array($callable)) $reflection = new ReflectionMethod($callable[0], $callable[1]);
        elseif (is_string($callable) && str_contains($callable, '::')) $reflection = new ReflectionMethod(...explode('::', $callable, 2));
        elseif (is_string($callable) && function_exists($callable)) $reflection = new ReflectionFunction($callable);
        elseif ($callable instanceof Closure) $reflection = new ReflectionFunction($callable);
        else return null;
        $parameters = array_map(static function (ReflectionParameter $parameter): string {
            $value = ($parameter->isVariadic() ? '...' : '').'$'.$parameter->getName();
            if ($parameter->isOptional() && $parameter->isDefaultValueAvailable()) {
                $value .= ' = '.var_export($parameter->getDefaultValue(), true);
            }
            return $value;
        }, $reflection->getParameters());
        return '('.implode(', ', $parameters).')';
    } catch (Throwable) {
        return null;
    }
}
