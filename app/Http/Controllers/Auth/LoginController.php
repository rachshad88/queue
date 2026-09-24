<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Services\SingleLoginService;
use App\Services\StationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
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
        $attemptKey = $this->attemptKey($request, $username);

        if (Cache::get($this->lockKey($attemptKey)) !== null) {
            return $this->backWith($request, 'Too many login attempts. Please try again in 15 minutes.');
        }

        $sql = 'SELECT u.user_id, u.username, u.password, u.usertype, u.department_id, u.status,
                       d.name AS department_name, d.status AS department_status
                FROM users u
                LEFT JOIN departments d ON u.department_id = d.id
                WHERE u.username = ?';

        $row = DB::selectOne($sql, [$username]);

        if (! $row) {
            return $this->failedAttempt($request, $username, $attemptKey, null);
        }

        // Deliberately generic: distinct "deactivated" messages would let an
        // attacker enumerate valid usernames and department states.
        if (isset($row->status) && strtolower((string) $row->status) === 'inactive') {
            return $this->failedAttempt($request, $username, $attemptKey, $row);
        }

        if (isset($row->department_status) && strtolower((string) $row->department_status) === 'inactive') {
            return $this->failedAttempt($request, $username, $attemptKey, $row);
        }

        if (! Hash::check($password, $row->password)) {
            return $this->failedAttempt($request, $username, $attemptKey, $row);
        }

        Cache::forget($this->attemptsKey($attemptKey));
        Cache::forget($this->lockKey($attemptKey));

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

        // Fresh session id on every login (including admins/superadmins) so a
        // pre-login session id can never be fixated into a privileged session.
        $request->session()->regenerate(true);

        // Mint fresh token for non-exempt accounts (admins/superadmins keep multi-device access).
        if (! $singleLogin->isExempt((string) $row->usertype)) {
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

    private function attemptKey(Request $request, string $username): string
    {
        return trim((string) $request->ip()).'|'.strtolower(trim($username));
    }

    private function attemptsKey(string $key): string
    {
        return "login:attempts:$key";
    }

    private function lockKey(string $key): string
    {
        return "login:lock:$key";
    }

    private function failedAttempt(Request $request, string $username, string $attemptKey, ?object $row)
    {
        $attempts = (int) Cache::get($this->attemptsKey($attemptKey), 0) + 1;
        Cache::put($this->attemptsKey($attemptKey), $attempts, now()->addMinutes(15));

        if ($attempts >= 5) {
            Cache::put($this->lockKey($attemptKey), time(), now()->addMinutes(15));
        }

        Log::warning('auth.failed', [
            'ip' => trim((string) $request->ip()),
            'username' => $username,
            'user_exists' => $row !== null,
        ]);

        return $this->backWith($request, 'Invalid username or password.');
    }
}
