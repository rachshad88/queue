<?php

namespace App\Services;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Session;

/**
 * Port of the native PHP app's single-device login logic (app/db.php).
 */
class SingleLoginService
{
    public function isExempt(string $usertype): bool
    {
        return $usertype === 'admin' || $usertype === 'superadmin';
    }

    public function clientIp(Request $request): string
    {
        $ip = trim((string) $request->server('REMOTE_ADDR', ''));
        if (config('queue.trust_proxy_header') === '1' && ! empty($request->header('X-Forwarded-For'))) {
            $first = trim(explode(',', (string) $request->header('X-Forwarded-For'))[0]);
            if ($first !== '') {
                $ip = $first;
            }
        }

        return filter_var($ip, FILTER_VALIDATE_IP) !== false ? $ip : '';
    }

    public function registerLoginToken(int $userId, string $token): void
    {
        DB::table('users')
            ->where('user_id', $userId)
            ->update([
                'login_token' => $token,
                'last_active' => DB::raw(config('queue.manila_now')),
                'last_login_at' => DB::raw(config('queue.manila_now')),
            ]);
    }

    /**
     * True when the current session is the account's active device. With
     * $stamp=true (default) the last_active/last_ip heartbeat is refreshed so
     * an online device keeps holding the lock. With $stamp=false the token is
     * only validated (used by session_check so a poll never revives an idle
     * account). Exempt users always pass.
     */
    public function assertSingleLogin(Request $request, int $userId, ?string $usertype, bool $stamp = true): bool
    {
        if ($this->isExempt((string) $usertype)) {
            return true;
        }

        $token = Session::get('login_token');
        if ($token === null) {
            return false;
        }

        if ($stamp) {
            $ip = $this->clientIp($request);
            $affected = DB::table('users')
                ->where('user_id', $userId)
                ->where('login_token', $token)
                ->update([
                    'last_active' => DB::raw(config('queue.manila_now')),
                    'last_ip' => $ip !== '' ? $ip : null,
                ]);

            // NOTE: mirrors the native app exactly — a same-ms repeat can report
            // 0 affected rows for identical datetime stamps (3.3ms precision).
            return $affected === 1;
        }

        return DB::table('users')
            ->where('user_id', $userId)
            ->where('login_token', $token)
            ->exists();
    }

    public function updateUserActivity(int $userId, bool $atLogin = false): void
    {
        $values = ['last_active' => DB::raw(config('queue.manila_now'))];
        if ($atLogin) {
            $values['last_login_at'] = DB::raw(config('queue.manila_now'));
        }

        DB::table('users')->where('user_id', $userId)->update($values);
    }

    /** Stamp the serving device: client IP -> users (last_ip/last_active). */
    public function stampActivity(int $userId, string $ip): void
    {
        $values = ['last_active' => DB::raw(config('queue.manila_now'))];
        if ($ip !== '') {
            $values['last_ip'] = $ip;
        }

        DB::table('users')->where('user_id', $userId)->update($values);
    }

    public function clearLoginToken(int $userId, string $token): void
    {
        DB::table('users')
            ->where('user_id', $userId)
            ->where('login_token', $token)
            ->update(['login_token' => null, 'last_active' => null]);
    }

    public function lastActiveFor(int $userId): ?string
    {
        $row = DB::table('users')->select('last_active')->where('user_id', $userId)->first();

        return $row?->last_active !== null ? (string) $row->last_active : null;
    }
}
