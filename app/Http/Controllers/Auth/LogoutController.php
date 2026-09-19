<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Services\EmitService;
use App\Services\SingleLoginService;
use App\Services\StationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Session;

class LogoutController extends Controller
{
    public function logout(Request $request, SingleLoginService $singleLogin, StationService $stationService, EmitService $emit)
    {
        $userId = (int) Session::get('user_id', 0);

        if ($userId > 0) {
            // Release admission/waiting section if the user occupies one (best-effort).
            $stationService->releaseSectionsForUser($userId);

            // Release the single-device login lock (non-admin accounts only).
            $isSuperadmin = (bool) Session::get('is_superadmin', false);
            $usertype = (string) Session::get('usertype', '');
            $isExempt = $isSuperadmin
                || $usertype === 'admin'
                || $usertype === 'superadmin';

            if (! $isExempt && ($token = Session::get('login_token'))) {
                $singleLogin->clearLoginToken($userId, (string) $token);
            }

            // Push a live refresh so monitors free the windows/stations immediately.
            $emit->queueUpdated(3);
            $emit->queueUpdated(15);
        }

        $request->session()->flush();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        $reason = (string) $request->query('reason', '');

        if ($reason === 'another_device') {
            return redirect('login.php?reason=another_device');
        }

        if ($reason === 'inactive') {
            return redirect('login.php?reason=inactive');
        }

        return redirect('login.php');
    }
}
