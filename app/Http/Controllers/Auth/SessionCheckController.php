<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Services\SingleLoginService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Session;

class SessionCheckController extends Controller
{
    public function check(Request $request, SingleLoginService $singleLogin)
    {
        if (Session::has('user_id') && Session::get('user_id') !== null) {
            // fall through
        } else {
            return response()->json(['ok' => true, 'logged_in' => false, 'reason' => '']);
        }

        $userId = (int) Session::get('user_id');
        $usertype = (string) Session::get('usertype', '');
        $activityValue = $request->query('activity', '1');
        $activity = $activityValue !== '0' && $activityValue !== 'false';

        if (! $singleLogin->assertSingleLogin($request, $userId, $usertype, $activity)) {
            // Never destroy here: the poll routes the browser through logout.php so the
            // station the user occupied is freed before the session dies.
            return response()->json(['ok' => false, 'logged_in' => false, 'reason' => 'another_device']);
        }

        // Idle expiry: only meaningful for unstamped ticks (activity=0) of non-exempt accounts.
        if (! $activity && ! $singleLogin->isExempt($usertype)) {
            $idleMin = $singleLogin->idleMinutesFor($userId);
            if ($idleMin !== null && $idleMin > (int) config('queue.idle_expiry_min')) {
                return response()->json(['ok' => false, 'logged_in' => false, 'reason' => 'inactive']);
            }
        }

        return response()->json(['ok' => true, 'logged_in' => true, 'reason' => '']);
    }
}
