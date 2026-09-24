<?php

use Illuminate\Support\Facades\Broadcast;

/*
 * Reverb channel authorization. This app uses session auth (not Laravel
 * guards), so the callbacks read the operator session directly:
 *
 * - `queue-display` is public (anonymous waiting-hall walls need no login).
 * - `dept.{id}` is private: the session's own department, or any
 *   department for superadmins (takeover mode).
 */

Broadcast::channel('dept.{id}', function ($user, $id) {
    if (! session()->has('user_id') || session('user_id') === null) {
        return false;
    }

    if (! empty(session('is_superadmin'))) {
        return true;
    }

    return (int) session('department_id', 0) === (int) $id;
});
