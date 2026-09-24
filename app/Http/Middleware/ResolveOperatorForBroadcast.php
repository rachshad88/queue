<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Bridges the app's session auth to Laravel's guard for the Reverb
 * channel-auth endpoint only (/broadcasting/auth).
 *
 * Operators authenticate via Session (user_id), never via guards, but
 * Pusher-style channel auth requires $request->user(). This resolves the
 * session operator into the web guard for the current request alone (no
 * session mutation, no login) so private dept channels can authorize
 * against a real user while channel callbacks keep using session rules.
 */
class ResolveOperatorForBroadcast
{
    public function handle(Request $request, Closure $next): Response
    {
        $userId = (int) $request->session()->get('user_id', 0);

        if ($userId > 0 && ! Auth::guard('web')->check()) {
            $user = User::query()->find($userId);

            if ($user !== null) {
                Auth::guard('web')->setUser($user);
            }
        }

        return $next($request);
    }
}
