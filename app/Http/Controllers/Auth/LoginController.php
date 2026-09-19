<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Services\SingleLoginService;
use App\Services\StationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Session;

class LoginController extends Controller
{
    public function show()
    {
        return view('auth.login');
    }

    public function login(Request $request, SingleLoginService $singleLogin, StationService $stationService)
    {
        $username = trim((string) $request->input('username', ''));
        $password = (string) $request->input('password', '');

        $sql = 'SELECT u.user_id, u.username, u.password, u.usertype, u.department_id, u.status,
                       d.name AS department_name, d.status AS department_status
                FROM users u
                LEFT JOIN departments d ON u.department_id = d.id
                WHERE u.username = ?';

        $row = DB::selectOne($sql, [$username]);

        if (! $row) {
            return $this->backWith($request, 'Invalid username or password.');
        }

        if (isset($row->status) && strtolower((string) $row->status) === 'inactive') {
            return $this->backWith($request, 'Your account has been deactivated. Please contact the administrator.');
        }

        if (isset($row->department_status) && strtolower((string) $row->department_status) === 'inactive') {
            return $this->backWith($request, 'Your department has been deactivated. Please contact the administrator.');
        }

        if (! Hash::check($password, $row->password)) {
            return $this->backWith($request, 'Invalid username or password.');
        }

        $isSuperadmin = strtolower(trim((string) $row->usertype)) === 'superadmin';

        Session::put([
            'user_id' => (int) $row->user_id,
            'usertype' => $isSuperadmin ? 'admin' : $row->usertype,
            'is_superadmin' => $isSuperadmin,
            'department_id' => (int) $row->department_id,
            'department' => $row->department_name,
            'username' => $row->username,
            'client_ip' => $singleLogin->clientIp($request),
            'default_pw' => $password === '12345',
        ]);

        // Mint fresh token for non-exempt accounts (admins/superadmins keep multi-device access).
        if (! $singleLogin->isExempt((string) $row->usertype)) {
            $request->session()->regenerate(true);
            $token = bin2hex(random_bytes(32));
            Session::put('login_token', $token);
            $singleLogin->registerLoginToken((int) $row->user_id, $token);
        }

        $singleLogin->updateUserActivity((int) $row->user_id, true);
        $stationService->releaseStaleSections(30);

        // Redirect destination mirrors the native app.
        if ($isSuperadmin) {
            $dest = 'index.php';
        } elseif (stripos((string) $row->department_name, 'admission') !== false) {
            $dest = 'choose_section.php';
        } elseif (stripos((string) $row->department_name, 'abtc') !== false) {
            Session::forget('view_mode');
            $dest = 'index.php';
        } elseif (stripos((string) $row->department_name, 'waiting') !== false) {
            $dest = 'choose_waiting_section.php';
        } else {
            $dest = 'index.php';
        }

        return view('auth.redirect', [
            'username' => $row->username,
            'destination' => $dest,
        ]);
    }

    private function backWith(Request $request, string $message)
    {
        return redirect()
            ->route('login.show')
            ->withInput($request->only('username'))
            ->with('error', $message);
    }
}
