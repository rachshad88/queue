<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Session;

/**
 * Port of app/edit_account.php: non-admin users edit their own profile.
 */
class EditAccountController extends Controller
{
    public function show(Request $request)
    {
        $usertype = (string) Session::get('usertype', '');
        if (strtolower($usertype) === 'admin') {
            return redirect('index.php');
        }

        $userId = (int) Session::get('user_id');
        $user = DB::selectOne(
            'SELECT username, firstname, lastname, middlename, position, department, department_id
             FROM users WHERE user_id = ?',
            [$userId]
        );

        if (! $user) {
            return response('User not found.', 404);
        }

        return view('edit_account', [
            'user' => $user,
            'error' => null,
        ]);
    }

    public function update(Request $request)
    {
        $usertype = (string) Session::get('usertype', '');
        if (strtolower($usertype) === 'admin') {
            return redirect('index.php');
        }

        $userId = (int) Session::get('user_id');

        $user = DB::selectOne(
            'SELECT username, firstname, lastname, middlename, position, department, department_id
             FROM users WHERE user_id = ?',
            [$userId]
        );

        if (! $user) {
            return response('User not found.', 404);
        }

        $firstname = trim((string) $request->input('firstname', ''));
        $middlename = trim((string) $request->input('middlename', ''));
        $lastname = trim((string) $request->input('lastname', ''));
        $usernameNew = trim((string) $request->input('username', ''));
        $position = trim((string) $request->input('position', ''));

        $error = null;
        if ($firstname === '' || $lastname === '' || $usernameNew === '') {
            $error = 'First name, Last name, and Username are required.';
        } else {
            try {
                DB::update(
                    'UPDATE users SET firstname = ?, middlename = ?, lastname = ?, username = ?, position = ? WHERE user_id = ?',
                    [$firstname, $middlename, $lastname, $usernameNew, $position, $userId]
                );
            } catch (\Throwable $e) {
                logger()->error('edit_account update failed: '.$e->getMessage());
                $error = 'Database error. Please try again later.';
            }
        }

        if ($error === null) {
            Session::put('username', $usernameNew);

            return redirect('edit_account.php?success=1');
        }

        return view('edit_account', [
            'user' => $user,
            'error' => $error,
        ]);
    }
}
