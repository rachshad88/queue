<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Session;

/**
 * Port of app/user_management.php: admin user CRUD; regular users edit self.
 */
class UserManagementController extends Controller
{
    public function show(Request $request)
    {
        $usertype = (string) Session::get('usertype', '');
        $userId = (int) Session::get('user_id');
        $isAdmin = $usertype === 'admin';

        $allDepartments = DB::select('SELECT id, name FROM departments ORDER BY name ASC');

        if ($isAdmin) {
            $users = DB::select(
                'SELECT u.*, d.name AS department_name FROM users u
                 LEFT JOIN departments d ON u.department_id = d.id
                 ORDER BY u.username ASC'
            );
        } else {
            $users = DB::select(
                'SELECT u.*, d.name AS department_name FROM users u
                 LEFT JOIN departments d ON u.department_id = d.id
                 WHERE u.user_id = ?',
                [$userId]
            );
        }

        return view('user_management', [
            'usertype' => $usertype,
            'isAdmin' => $isAdmin,
            'departments' => $allDepartments,
            'users' => $users,
        ]);
    }

    public function handle(Request $request)
    {
        $usertype = (string) Session::get('usertype', '');
        $userId = (int) Session::get('user_id');
        $action = (string) $request->input('action', '');

        if ($action === 'add') {
            if ($usertype !== 'admin') {
                return redirect('login.php');
            }

            $newUsername = trim((string) $request->input('username', ''));
            if ($newUsername === '' || $this->usernameTaken($newUsername)) {
                return redirect('user_management.php?error=duplicate');
            }

            $data = [
                trim((string) $request->input('username', '')),
                password_hash('12345', PASSWORD_DEFAULT),
                (string) $request->input('usertype', ''),
                trim((string) $request->input('firstname', '')),
                trim((string) $request->input('middlename', '')),
                trim((string) $request->input('lastname', '')),
                trim((string) $request->input('position', '')),
                $request->input('department'),
            ];

            try {
                DB::insert(
                    "INSERT INTO users (username, password, usertype, firstname, middlename, lastname, position, department_id, status)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')",
                    $data
                );
            } catch (\Throwable $e) {
                logger()->error('user add failed: '.$e->getMessage());

                return redirect('user_management.php?error=db');
            }

            return redirect('user_management.php?success=1');
        }

        // edit
        $id = (int) $request->input('id', 0);
        if ($usertype !== 'admin' && $id !== $userId) {
            abort(403, 'Access denied.');
        }
        $username = trim((string) $request->input('username', ''));
        if ($username === '' || $this->usernameTaken($username, $id)) {
            return redirect('user_management.php?error=duplicate');
        }
        $usertypeNew = (string) $request->input('usertype', 'regular');
        $firstname = trim((string) $request->input('firstname', ''));
        $middlename = trim((string) $request->input('middlename', ''));
        $lastname = trim((string) $request->input('lastname', ''));
        $position = trim((string) $request->input('position', ''));
        $department = $request->input('department');
        $newPassword = (string) $request->input('password', '');
        $status = (string) $request->input('status', 'active');

        try {
            if ($usertype !== 'admin') {
                $params = [$username, $firstname, $middlename, $lastname, $position];
                $passwordSet = ! empty($newPassword) ? ', password=?' : '';
                if (! empty($newPassword)) {
                    $params[] = password_hash($newPassword, PASSWORD_DEFAULT);
                }
                $params[] = $id;
                DB::update(
                    "UPDATE users
                     SET username=?, firstname=?, middlename=?, lastname=?, position=?{$passwordSet}
                     WHERE user_id=?",
                    $params
                );
            } elseif (! empty($newPassword)) {
                DB::update(
                    'UPDATE users
                     SET username=?, usertype=?, firstname=?, middlename=?, lastname=?, position=?, department_id=?, status=?, password=?
                     WHERE user_id=?',
                    [$username, $usertypeNew, $firstname, $middlename, $lastname, $position, $department, $status, password_hash($newPassword, PASSWORD_DEFAULT), $id]
                );
            } else {
                DB::update(
                    'UPDATE users
                     SET username=?, usertype=?, firstname=?, middlename=?, lastname=?, position=?, department_id=?, status=?
                     WHERE user_id=?',
                    [$username, $usertypeNew, $firstname, $middlename, $lastname, $position, $department, $status, $id]
                );
            }
        } catch (\Throwable $e) {
            logger()->error('user update failed: '.$e->getMessage());

            return redirect('user_management.php?error=db');
        }

        return redirect('user_management.php?edited=1');
    }

    /**
     * Case-insensitive username check (login matches case-insensitively under
     * the database collation, so duplicates would make logins ambiguous).
     */
    private function usernameTaken(string $username, ?int $exceptUserId = null): bool
    {
        $query = DB::table('users')->whereRaw('LOWER(username) = ?', [strtolower($username)]);
        if ($exceptUserId !== null && $exceptUserId > 0) {
            $query->where('user_id', '!=', $exceptUserId);
        }

        return $query->exists();
    }
}
