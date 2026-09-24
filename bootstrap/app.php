<?php

use App\Http\Middleware\AcceptLegacyCsrfNames;
use App\Http\Middleware\EnsureSingleLogin;
use App\Http\Middleware\NormalizeBaseUrl;
use App\Http\Middleware\ResolveOperatorForBroadcast;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Foundation\Http\Middleware\TrimStrings;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    // Reverb channel-auth endpoint (/broadcasting/auth). Session-based like
    // the rest of the app (web middleware) + per-IP throttle. Attributes go
    // through withBroadcasting (not Broadcast::routes in a provider) so the
    // framework registers exactly one route with this middleware.
    ->withBroadcasting(
        __DIR__.'/../routes/channels.php',
        ['middleware' => ['web', ResolveOperatorForBroadcast::class, 'throttle:60,1']],
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // CSRF sits in the WEB group, not global middleware: use replaceInGroup
        // (web(replace:)) so AcceptLegacyCsrfNames actually runs and accepts the
        // native app's `csrf_token` input / X-CSRF-Token header conventions.
        $middleware->web(replace: [
            PreventRequestForgery::class => AcceptLegacyCsrfNames::class,
        ]);

        // Fix baseUrl collapse on /queue/app/index.php so relative redirects
        // (e.g. logged-out hub -> login.php) stay app-relative and unbroken.
        $middleware->web(append: [
            NormalizeBaseUrl::class,
        ]);

        // Native parity: passwords are NEVER trimmed (leading/trailing spaces
        // are significant), so the password inputs bypass the global trimmer.
        // TrimStrings::except() matches input keys in this Laravel version.
        TrimStrings::except(['old_password', 'new_password']);

        $middleware->alias([
            'single.login' => EnsureSingleLogin::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );

        // Match the native app's csrfFail(): 403 JSON, not the default 419 page.
        $exceptions->render(function (HttpException $e, Request $request) {
            if ($e->getStatusCode() === 419) {
                return response()->json([
                    'success' => false,
                    'message' => 'Invalid or expired security token. Please refresh and try again.',
                ], 403);
            }
        });
    })->create();
