<?php

namespace App\Http\Controllers;

use App\Services\SingleLoginService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Session;

/**
 * Port of app/sidebar.php: session-driven sidebar partial (no DB queries).
 * Returns 401 JSON on auth failure so sidebar.js navigates to login.php.
 */
class SidebarController extends Controller
{
    public function index(Request $request, SingleLoginService $singleLogin)
    {
        if (! Session::has('user_id') || Session::get('user_id') === null) {
            return response()->json(['error' => 'Not logged in'], 401);
        }

        $userId = (int) Session::get('user_id');
        $usertype = (string) Session::get('usertype', '');
        if (! $singleLogin->assertSingleLogin($request, $userId, $usertype)) {
            return response()->json(['error' => 'Logged in on another device'], 401);
        }

        $path = trim((string) $request->path(), '/');
        $currentPage = $path === '' ? 'index.php' : basename($path);

        $username = (string) Session::get('username', '');
        $dept = (string) Session::get('department', '');
        $usertype = strtolower($usertype);
        $isSuper = ! empty(Session::get('is_superadmin', false));
        $isCustomer = Session::get('view_mode') === 'for_customer';

        $initials = '';
        if ($username !== '') {
            $parts = explode(' ', $username);
            $initials = strtoupper(mb_substr($parts[0], 0, 1).(isset($parts[1]) ? mb_substr($parts[1], 0, 1) : ''));
        }

        return response(view('sidebar', [
            'currentPage' => $currentPage,
            'username' => $username,
            'dept' => $dept,
            'usertype' => $usertype,
            'isSuper' => $isSuper,
            'isCustomer' => $isCustomer,
            'initials' => $initials,
        ]))
            ->withHeaders([
                'Cache-Control' => 'no-store, no-cache, must-revalidate, max-age=0',
                'Pragma' => 'no-cache',
                'Expires' => 0,
            ]);
    }
}
