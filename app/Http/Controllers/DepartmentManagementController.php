<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Session;

/**
 * Port of app/department_management.php: admin-only department CRUD.
 */
class DepartmentManagementController extends Controller
{
    public function show(Request $request)
    {
        $usertype = (string) Session::get('usertype', '');
        if ($usertype !== 'admin') {
            return redirect('login.php');
        }

        $departments = DB::select(
            'SELECT id, name, prefix, server, status FROM departments
             ORDER BY CASE id WHEN 15 THEN 1 WHEN 3 THEN 2 WHEN 1 THEN 3 WHEN 2 THEN 4
             WHEN 4 THEN 5 WHEN 12 THEN 6 WHEN 5 THEN 7 WHEN 6 THEN 8 WHEN 9 THEN 9
             WHEN 7 THEN 10 WHEN 13 THEN 11 WHEN 14 THEN 12 WHEN 8 THEN 13 ELSE 100 END, name ASC'
        );

        return view('department_management', [
            'departments' => $departments,
        ]);
    }

    public function handle(Request $request)
    {
        $usertype = (string) Session::get('usertype', '');
        if ($usertype !== 'admin') {
            return redirect('login.php');
        }

        $action = (string) $request->input('action', '');

        if ($action === 'add') {
            $name = trim((string) $request->input('name', ''));
            $prefix = trim((string) $request->input('prefix', ''));
            $server = $request->has('server') ? trim((string) $request->input('server', '')) : null;
            $status = $request->has('status') && in_array(strtolower((string) $request->input('status', '')), ['active', 'inactive'], true)
                ? strtolower((string) $request->input('status', ''))
                : 'active';

            if ($name === '' || $prefix === '') {
                return redirect('department_management.php?error=missing');
            }

            try {
                DB::insert('INSERT INTO departments (name, prefix, server, status) VALUES (?, ?, ?, ?)', [$name, $prefix, $server, $status]);
            } catch (\Throwable $e) {
                logger()->error('department add failed: '.$e->getMessage());

                return redirect('department_management.php?error=db');
            }

            return redirect('department_management.php?added=1');
        }

        // edit
        $id = (int) $request->input('id', 0);
        $name = trim((string) $request->input('name', ''));
        $prefix = trim((string) $request->input('prefix', ''));
        $server = $request->has('server') ? trim((string) $request->input('server', '')) : null;
        $status = $request->has('status') && in_array(strtolower((string) $request->input('status', '')), ['active', 'inactive'], true)
            ? strtolower((string) $request->input('status', ''))
            : 'active';

        if ($id <= 0 || $name === '' || $prefix === '') {
            return redirect('department_management.php?error=missing');
        }

        try {
            DB::update(
                'UPDATE departments SET name = ?, prefix = ?, server = ?, status = ? WHERE id = ?',
                [$name, $prefix, $server, $status, $id]
            );
        } catch (\Throwable $e) {
            logger()->error('department update failed: '.$e->getMessage());

            return redirect('department_management.php?error=db');
        }

        return redirect('department_management.php?edited=1');
    }
}
