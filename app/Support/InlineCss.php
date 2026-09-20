<?php

namespace App\Support;

final class InlineCss
{
    /** @var array<string, string> */
    private static array $resolved = [];

    public static function style(string $path): string
    {
        if (isset(self::$resolved[$path])) {
            return self::$resolved[$path];
        }

        $absolute = public_path($path);

        if (! is_file($absolute)) {
            return self::$resolved[$path] = '';
        }

        $css = self::rewriteUrlReferences((string) file_get_contents($absolute), $path);

        return self::$resolved[$path] = "\n<style>\n".$css."\n</style>\n";
    }

    private static function rewriteUrlReferences(string $css, string $publicPath): string
    {
        $prefix = (string) pathinfo($publicPath, PATHINFO_DIRNAME);
        $prefix = trim($prefix, '/');

        return preg_replace_callback(
            '/url\(\s*(?:"([^"]+)"|\'([^\']+)\'|([^\)]*?))\s*\)/i',
            static function (array $match) use ($prefix): string {
                $url = trim($match[1] ?: ($match[2] ?: ($match[3] ?? '')));

                if ($url === '' || preg_match('~^(?:https?:|//|/|data:|#)~i', $url) === 1) {
                    return 'url('.$url.')';
                }

                return 'url(/'.$prefix.'/'.$url.')';
            },
            $css,
        );
    }
}
