<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Blade;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Symfony\Component\HttpFoundation\Response;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Blade::directive('inlineCss', static function (string $expression): string {
            return "<?php echo \App\Support\InlineCss::style($expression); ?>";
        });

        $this->registerRateLimiters();
    }

    /**
     * App-level rate limits (survive a direct php-fpm hit that bypasses nginx).
     * Keys are per client IP, so clinic NAT traffic behind one proxy shares a
     * bucket by design; only the credential surfaces are strict.
     */
    private function registerRateLimiters(): void
    {
        RateLimiter::for('login', function (Request $request): Limit {
            return Limit::perMinute(10)
                ->by($this->loginKey($request))
                ->response(fn (): Response => $this->loginThrottleResponse($request));
        });

        // Public kiosk issuance: 30/min matches the nginx `tickets` flood zone
        // and is generous on purpose — the whole clinic shares one CGNAT IP,
        // so a tight gate (e.g. 6/min) falsely 429s legit morning-rush taps.
        // Flood protection stays at the nginx layer; this is defense-in-depth.
        RateLimiter::for('kiosk-issue', function (Request $request): Limit {
            return Limit::perMinute(30)->by(trim((string) $request->ip()));
        });

        RateLimiter::for('password-update', function (Request $request): Limit {
            $user = (int) $request->session()->get('user_id', 0);

            return Limit::perMinute(3)->by(($user > 0 ? "user:$user" : 'guest').'|'.trim((string) $request->ip()));
        });
    }

    private function loginKey(Request $request): string
    {
        return trim((string) $request->ip()).'|'.strtolower(trim((string) $request->input('username', '')));
    }

    private function loginThrottleResponse(Request $request): Response
    {
        $message = 'Too many login attempts. Please try again later.';

        if ($request->expectsJson()) {
            return response()->json(['success' => false, 'message' => $message], 429);
        }

        return redirect()
            ->route('login.show')
            ->withInput($request->only('username'))
            ->with('error', $message)
            ->setStatusCode(429);
    }
}
