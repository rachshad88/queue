<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\URL;
use Symfony\Component\HttpFoundation\Response;

/**
 * Keep `url()`/`route()` and relative redirects anchored to the app base.
 *
 * nginx sets SCRIPT_NAME=/queue/app/index.php so every URL reaches the Laravel
 * front controller. When the actual request path IS index.php, Symfony's
 * getBaseUrl() collapses to the whole script path (…/index.php) and generated
 * URLs become /queue/app/index.php/login.php (broken). Forcing the root URL to
 * the script's directory whenever that happens restores clean app-relative
 * generation. Skip when baseUrl is empty (unit/feature tests).
 */
class NormalizeBaseUrl
{
    public function handle(Request $request, Closure $next): Response
    {
        $base = (string) $request->getBaseUrl();

        if ($base !== '' && basename($base) === 'index.php') {
            URL::forceRootUrl(rtrim(
                $request->getScheme().'://'.$request->getHttpHost().dirname($base),
                '/',
            ));
        }

        return $next($request);
    }
}
