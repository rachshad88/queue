<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Session;

/**
 * Port of app/update_password.php. Passwords are NEVER trimmed (leading/trailing
 * spaces are valid). The default-password flow allows omitting old_password.
 */
class AccountController extends Controller
{
    public function updatePassword(Request $request)
    {
        $userId = (int) Session::get('user_id', 0);

        // Raw input: bypass the global TrimStrings middleware for these two
        // fields via TrimStrings::except(['update_password.php']).
        $newPassword = (string) $request->input('new_password', '');
        $oldPassword = (string) $request->input('old_password', '');
        $defaultPw = Session::get('default_pw') === true;

        if ($newPassword === '') {
            return response()->json(['success' => false, 'message' => 'Missing new password']);
        }

        if (strlen($newPassword) < 5) {
            return response()->json(['success' => false, 'message' => 'New password too short']);
        }

        $currentHash = DB::table('users')->where('user_id', $userId)->value('password');

        if ($oldPassword === '') {
            if (! $defaultPw) {
                return response()->json(['success' => false, 'message' => 'Missing parameters']);
            }
            if ($currentHash !== null && password_verify($newPassword, (string) $currentHash)) {
                return response()->json(['success' => false, 'message' => 'New password must be different from your current password']);
            }
        } else {
            if ($currentHash === null || $currentHash === '') {
                return response()->json(['success' => false, 'message' => 'User not found']);
            }
            if (! password_verify($oldPassword, (string) $currentHash)) {
                return response()->json(['success' => false, 'message' => 'Old password is incorrect']);
            }
            if (password_verify($newPassword, (string) $currentHash)) {
                return response()->json(['success' => false, 'message' => 'New password must be different from your current password']);
            }
        }

        $affected = DB::table('users')
            ->where('user_id', $userId)
            ->update(['password' => password_hash($newPassword, PASSWORD_DEFAULT)]);

        if ($affected === false) {
            return response()->json(['success' => false, 'message' => 'Database update failed']);
        }

        Session::put('default_pw', false);

        return response()->json(['success' => true]);
    }
}
