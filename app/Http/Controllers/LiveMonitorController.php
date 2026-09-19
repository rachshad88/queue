<?php

namespace App\Http\Controllers;

use Illuminate\Support\Facades\DB;

/**
 * Port of app/live.php: the public "Live Queue Monitor" display wall.
 * Unauthenticated by design (monitors are wall-mounted public screens).
 */
class LiveMonitorController extends Controller
{
    public function show()
    {
        $departments = DB::select(
            "SELECT id, name FROM departments
             WHERE ISNULL(status, 'active') = 'active'
             ORDER BY CASE id WHEN 15 THEN 1 WHEN 3 THEN 2 WHEN 1 THEN 3 WHEN 2 THEN 4 WHEN 4 THEN 5
                WHEN 12 THEN 6 WHEN 5 THEN 7 WHEN 6 THEN 8 WHEN 9 THEN 9 WHEN 7 THEN 10
                WHEN 13 THEN 11 WHEN 14 THEN 12 WHEN 8 THEN 13 ELSE 100 END, name ASC"
        );

        $admissionSections = DB::select('SELECT section_name FROM admission_sections ORDER BY id ASC');
        $waitingSections = DB::select('SELECT section_name FROM waiting_sections ORDER BY id ASC');

        return view('live', [
            'departments' => $departments,
            'admissionSections' => $admissionSections,
            'waitingSections' => $waitingSections,
        ]);
    }
}
