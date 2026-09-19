<?php

namespace App\Http\Middleware;

use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;

/**
 * Accepts the legacy client conventions in the native app in addition to the
 * Laravel defaults: the CSRF token may arrive as the `csrf_token` form field or
 * as the `X-CSRF-Token` header (js/index.js httpJson + inline fetch calls).
 */
class AcceptLegacyCsrfNames extends PreventRequestForgery
{
    protected function getTokenFromRequest($request)
    {
        $token = parent::getTokenFromRequest($request);

        if (! $token) {
            $token = $request->input('csrf_token');
        }

        if (! $token) {
            $token = $request->header('X-CSRF-Token');
        }

        return $token;
    }
}
