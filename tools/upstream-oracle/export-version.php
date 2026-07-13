<?php

declare(strict_types=1);

if ($argc < 3) {
    fwrite(STDERR, "Usage: export-version.php <version-directory> <output.json>\n");
    exit(2);
}

$directory = realpath($argv[1]);
if (!$directory || !is_file($directory.'/vendor/autoload.php')) {
    fwrite(STDERR, "Oracle dependencies are not installed: ".$argv[1]."\n");
    exit(2);
}
require $directory.'/vendor/autoload.php';

$environment = new Twig\Environment(new Twig\Loader\ArrayLoader());
$lock = json_decode(file_get_contents($directory.'/composer.lock'), true);
$twigPackage = null;
foreach ($lock['packages'] as $package) {
    if ($package['name'] === 'twig/twig') {
        $twigPackage = $package;
        break;
    }
}
if (!$twigPackage) {
    throw new RuntimeException('twig/twig is absent from '.$directory.'/composer.lock');
}

$facts = array(
    'schemaVersion' => 1,
    'twig' => array(
        'version' => Twig\Environment::VERSION,
        'tag' => $twigPackage['version'],
        'commit' => isset($twigPackage['source']['reference']) ? $twigPackage['source']['reference'] : null,
    ),
    'tags' => exportVersionTags($environment),
    'callables' => array(
        'filter' => exportVersionCallables($environment->getFilters()),
        'function' => exportVersionCallables($environment->getFunctions()),
        'test' => exportVersionCallables($environment->getTests()),
    ),
    'operators' => exportVersionOperators($environment),
);

$json = json_encode($facts, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)."\n";
if ($json === false) {
    throw new RuntimeException('Unable to encode version oracle: '.json_last_error_msg());
}
file_put_contents($argv[2], $json);

function exportVersionTags($environment)
{
    $result = array();
    foreach ($environment->getTokenParsers() as $parser) {
        $result[] = array(
            'name' => $parser->getTag(),
            'class' => get_class($parser),
            'alwaysAllowedInSandbox' => method_exists($parser, 'isAlwaysAllowedInSandbox') ? $parser->isAlwaysAllowedInSandbox() : null,
        );
    }
    usort($result, function ($a, $b) { return strcmp($a['name'], $b['name']); });
    return $result;
}

function exportVersionCallables($callables)
{
    $result = array();
    foreach ($callables as $callable) {
        $result[] = array(
            'name' => $callable->getName(),
            'class' => get_class($callable),
            'signature' => reflectVersionCallable($callable->getCallable()),
            'deprecated' => method_exists($callable, 'isDeprecated') && $callable->isDeprecated(),
            'aliases' => method_exists($callable, 'getAliases') ? array_values($callable->getAliases()) : array(),
            'alwaysAllowedInSandbox' => method_exists($callable, 'isAlwaysAllowedInSandbox') ? $callable->isAlwaysAllowedInSandbox() : null,
        );
    }
    usort($result, function ($a, $b) { return strcmp($a['name'], $b['name']); });
    return $result;
}

function exportVersionOperators($environment)
{
    if (method_exists($environment, 'getExpressionParsers')) {
        $registry = $environment->getExpressionParsers();
        $reflection = new ReflectionObject($registry);
        foreach ($reflection->getProperties() as $property) {
            $property->setAccessible(true);
            $value = $property->getValue($registry);
            if ($property->getName() === 'parsersByName' && is_array($value)) {
                $objects = array();
                array_walk_recursive($value, function ($item) use (&$objects) {
                    if (is_object($item)) $objects[spl_object_hash($item)] = $item;
                });
                return normalizeVersionExpressionParsers(array_values($objects));
            }
        }
        return array();
    }

    $result = array();
    foreach (array('prefix' => $environment->getUnaryOperators(), 'infix' => $environment->getBinaryOperators()) as $fixity => $operators) {
        foreach ($operators as $name => $operator) {
            $result[] = array(
                'name' => $name,
                'class' => isset($operator['class']) ? $operator['class'] : null,
                'precedence' => isset($operator['precedence']) ? $operator['precedence'] : null,
                'associativity' => isset($operator['associativity']) && $operator['associativity'] === 2 ? 'right' : 'left',
                'fixity' => $fixity,
                'aliases' => array(),
            );
        }
    }
    usort($result, function ($a, $b) { return strcmp($a['name'], $b['name']); });
    return $result;
}

function normalizeVersionExpressionParsers($parsers)
{
    $result = array();
    foreach ($parsers as $parser) {
        if (!method_exists($parser, 'getName')) continue;
        $associativity = method_exists($parser, 'getAssociativity') ? $parser->getAssociativity() : null;
        $result[] = array(
            'name' => $parser->getName(),
            'class' => get_class($parser),
            'precedence' => method_exists($parser, 'getPrecedence') ? $parser->getPrecedence() : null,
            'associativity' => is_object($associativity) && property_exists($associativity, 'name') ? strtolower($associativity->name) : null,
            'fixity' => strpos(get_class($parser), 'Prefix') !== false ? 'prefix' : 'infix',
            'aliases' => method_exists($parser, 'getAliases') ? array_values($parser->getAliases()) : array(),
        );
    }
    usort($result, function ($a, $b) { return strcmp($a['name'], $b['name']); });
    return $result;
}

function reflectVersionCallable($callable)
{
    try {
        if (is_array($callable)) $reflection = new ReflectionMethod($callable[0], $callable[1]);
        elseif (is_string($callable) && strpos($callable, '::') !== false) {
            $parts = explode('::', $callable, 2);
            $reflection = new ReflectionMethod($parts[0], $parts[1]);
        } elseif (is_string($callable) && function_exists($callable)) $reflection = new ReflectionFunction($callable);
        elseif ($callable instanceof Closure) $reflection = new ReflectionFunction($callable);
        else return null;
        $parameters = array();
        foreach ($reflection->getParameters() as $parameter) {
            $value = ($parameter->isVariadic() ? '...' : '').'$'.$parameter->getName();
            if ($parameter->isOptional() && $parameter->isDefaultValueAvailable()) $value .= ' = '.var_export($parameter->getDefaultValue(), true);
            $parameters[] = $value;
        }
        return '('.implode(', ', $parameters).')';
    } catch (Exception $error) {
        return null;
    }
}
