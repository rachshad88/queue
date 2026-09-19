<?php

namespace App\Http\Middleware;

use App\Services\SingleLoginService;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Session;
use Symfony\Component\HttpFoundation\Response;

class EnsureSingleLogin
{
    public function __construct(private readonly SingleLoginService $singleLogin) {}

    public function handle(Request $request, Closure $next): Response
    {
        $userId = (int) Session::get('user_id', 0);

        if ($userId < 1) {
            return redirect('login.php');
        }

        if (! $this->singleLogin->assertSingleLogin(
            $request,
            $userId,
            (string) Session::get('usertype', ''),
            true,
        )) {
            // Native parity: AJAX/POST endpoints answer 401 JSON; page GETs
            // bounce through logout.php so the station is freed first.
            if ($request->isMethod('POST') || $request->expectsJson()) {
                return response()->json([
                    'success' => false,
                    'message' => 'Logged in on another device',
                ], 401);
            }

            return redirect('logout.php?reason=another_device');
        }

        return $next($request);
    }
}
