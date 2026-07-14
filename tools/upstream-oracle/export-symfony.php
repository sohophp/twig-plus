<?php

declare(strict_types=1);

if ($argc < 3) {
    fwrite(STDERR, "Usage: export-symfony.php <oracle-directory> <output.json>\n");
    exit(2);
}
$directory = realpath($argv[1]);
if (!$directory || !is_file($directory.'/vendor/autoload.php')) throw new RuntimeException('Symfony oracle dependencies are not installed.');
require $directory.'/vendor/autoload.php';

$lock = json_decode(file_get_contents($directory.'/composer.lock'), true, flags: JSON_THROW_ON_ERROR);
$packages = [];
foreach ($lock['packages'] as $package) $packages[$package['name']] = [
    'version' => ltrim($package['version'], 'v'),
    'commit' => $package['source']['reference'] ?? null,
];
$bridge = new ReflectionClass(Symfony\Bridge\Twig\Extension\RoutingExtension::class);
$extensionDirectory = dirname($bridge->getFileName());
$extensions = [];
$callables = [];
$tags = [];
foreach (glob($extensionDirectory.'/*Extension.php') as $file) {
    $class = 'Symfony\\Bridge\\Twig\\Extension\\'.basename($file, '.php');
    if (!class_exists($class)) continue;
    $reflection = new ReflectionClass($class);
    if ($reflection->isAbstract()) continue;
    try {
        $extension = $reflection->getConstructor()?->getNumberOfRequiredParameters()
            ? $reflection->newInstanceWithoutConstructor() : $reflection->newInstance();
        $facts = ['class' => $class, 'package' => componentForExtension($class)];
        foreach (['getFunctions' => 'function', 'getFilters' => 'filter', 'getTests' => 'test'] as $method => $kind) {
            if (!method_exists($extension, $method)) continue;
            try {
                foreach ($extension->{$method}() as $callable) $callables[] = [
                    'kind' => $kind, 'name' => $callable->getName(), 'extension' => $class,
                    'package' => $facts['package'], 'signature' => reflectSymfonyCallable($callable->getCallable()),
                    'deprecated' => method_exists($callable, 'isDeprecated') && $callable->isDeprecated(),
                ];
            } catch (Throwable $error) {
                $facts['callableError'] = $error::class;
            }
        }
        if (method_exists($extension, 'getTokenParsers')) try {
            foreach ($extension->getTokenParsers() as $parser) $tags[] = [
                'name' => $parser->getTag(), 'extension' => $class, 'package' => $facts['package'],
            ];
        } catch (Throwable $error) {
            $facts['tagError'] = $error::class;
        }
        $extensions[] = $facts;
    } catch (Throwable $error) {
        $extensions[] = ['class' => $class, 'package' => componentForExtension($class), 'loadError' => $error::class];
    }
}
usort($callables, static fn (array $a, array $b): int => [$a['kind'], $a['name']] <=> [$b['kind'], $b['name']]);
usort($tags, static fn (array $a, array $b): int => $a['name'] <=> $b['name']);
usort($extensions, static fn (array $a, array $b): int => $a['class'] <=> $b['class']);

$result = [
    'schemaVersion' => 1,
    'symfony' => $packages['symfony/twig-bridge'] ?? null,
    'packages' => $packages,
    'extensions' => $extensions,
    'callables' => $callables,
    'tags' => $tags,
    'references' => [
        'route' => ['symfony/routing'], 'asset' => ['symfony/asset'], 'translation' => ['symfony/translation'],
        'form' => ['symfony/form'], 'security' => ['symfony/security-core'], 'fragment' => ['symfony/http-kernel'],
        'importmap' => ['symfony/asset-mapper'],
    ],
];
file_put_contents($argv[2], json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR)."\n");

function componentForExtension(string $class): string
{
    foreach ([
        'Asset' => 'symfony/asset', 'Form' => 'symfony/form', 'ImportMap' => 'symfony/asset-mapper',
        'Routing' => 'symfony/routing', 'Security' => 'symfony/security-core', 'Translation' => 'symfony/translation',
        'HttpKernel' => 'symfony/http-kernel',
    ] as $needle => $package) if (str_contains($class, $needle)) return $package;
    return 'symfony/twig-bridge';
}

function reflectSymfonyCallable(mixed $callable): ?string
{
    try {
        if (is_array($callable)) $reflection = new ReflectionMethod($callable[0], $callable[1]);
        elseif (is_string($callable) && str_contains($callable, '::')) $reflection = new ReflectionMethod(...explode('::', $callable, 2));
        elseif (is_string($callable) && function_exists($callable)) $reflection = new ReflectionFunction($callable);
        elseif ($callable instanceof Closure) $reflection = new ReflectionFunction($callable);
        else return null;
        return '('.implode(', ', array_map(static function (ReflectionParameter $parameter): string {
            $value = ($parameter->isVariadic() ? '...' : '').'$'.$parameter->getName();
            if ($parameter->isOptional() && $parameter->isDefaultValueAvailable()) $value .= ' = '.var_export($parameter->getDefaultValue(), true);
            return $value;
        }, $reflection->getParameters())).')';
    } catch (Throwable) {
        return null;
    }
}
