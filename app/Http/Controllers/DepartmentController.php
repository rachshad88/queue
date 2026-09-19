<?php

namespace App\Http\Controllers;

use App\Services\StationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Session;

/**
 * Port of app/switch_department.php (superadmin takeover) + the public
 * app/get_departments.php listing consumed by the transfer modal.
 */
class DepartmentController extends Controller
{
    public function switch(Request $request, StationService $stations)
    {
        $userId = (int) Session::get('user_id', 0);
        $isSuperadmin = ! empty(Session::get('is_superadmin', false));

        if (! $isSuperadmin) {
            return response()->json(['success' => false, 'message' => 'Access denied']);
        }

        $departmentId = (int) $request->input('department_id', 0);
        $sectionId = (int) $request->input('section_id', 0);
        if (! $departmentId) {
            return response()->json(['success' => false, 'message' => 'Department ID is required']);
        }

        $dept = DB::table('departments')->select('id', 'name', 'status', 'server')->where('id', $departmentId)->first();
        if (! $dept) {
            return response()->json(['success' => false, 'message' => 'Department not found']);
        }
        if (isset($dept->status) && strtolower(trim((string) $dept->status)) === 'inactive') {
            return response()->json(['success' => false, 'message' => 'Department is inactive']);
        }

        $table = $stations->sectionsTableForDept($departmentId, (string) $dept->name);

        // The chosen window (e.g. "Admission 4") for sectioned departments.
        // Session-scoped: the superadmin impersonates the station WITHOUT
        // touching the section's occupied_by.
        $section = null;
        if ($table !== null && $sectionId) {
            $section = DB::table($table)->select('id', 'section_name')->where('id', $sectionId)->first();
            if (! $section) {
                return response()->json(['success' => false, 'message' => 'Section not found for this department']);
            }
        }

        Session::put('department_id', (int) $dept->id);
        Session::put('department', (string) $dept->name);
        Session::forget('view_mode');

        if ($section) {
            Session::put('takeover_section_id', (int) $section->id);
            Session::put('takeover_section_name', (string) $section->section_name);
            Session::put('takeover_section_table', $table);
        } else {
            Session::forget(['takeover_section_id', 'takeover_section_name', 'takeover_section_table']);
        }

        $server = isset($dept->server) ? (string) $dept->server : '';
        $sectioned = $table !== null;
        $sections = [];
        if ($sectioned) {
            $sections = DB::select(
                "SELECT s.id, s.section_name, s.occupied_by,
                        CASE WHEN u.user_id IS NOT NULL THEN RTRIM(u.firstname) + ' ' + RTRIM(u.lastname) ELSE NULL END AS staff
                 FROM {$table} s
                 LEFT JOIN users u ON s.occupied_by = u.user_id
                 ORDER BY s.id ASC"
            );
        }

        // Effective window after the operation (drives the header badge).
        $window = $stations->operatorSection($userId, (int) $dept->id);

        return response()->json([
            'success' => true,
            'department_id' => (int) $dept->id,
            'department_name' => (string) $dept->name,
            'server' => $server,
            'sectioned' => $sectioned,
            'section_id' => $section ? (int) $section->id : null,
            'section_name' => $section ? (string) $section->section_name : null,
            'sections' => $sections,
            'takeover_section_id' => Session::get('takeover_section_id'),
            'active_window' => $window ? (string) $window->section_name : null,
        ]);
    }

    public function getList()
    {
        $rows = DB::select(
            "SELECT id, name, server FROM departments
             WHERE ISNULL(status,'active') = 'active'
             ORDER BY CASE id WHEN 15 THEN 1 WHEN 3 THEN 2 WHEN 1 THEN 3 WHEN 2 THEN 4
                                  WHEN 4 THEN 5 WHEN 12 THEN 6 WHEN 5 THEN 7 WHEN 6 THEN 8
                                  WHEN 9 THEN 9 WHEN 7 THEN 10 WHEN 13 THEN 11 WHEN 14 THEN 12
                                  WHEN 8 THEN 13 ELSE 100 END, name ASC"
        );

        return response()->json(array_map(
            fn ($r) => [
                'id' => (int) $r->id,
                'name' => (string) $r->name,
                'server' => isset($r->server) && (string) $r->server !== '' ? (string) $r->server : null,
            ],
            $rows
        ));
    }
}
