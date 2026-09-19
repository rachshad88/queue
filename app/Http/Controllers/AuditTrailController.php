<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Port of app/audit_trail.php: plain queue_log audit view with
 * department + queue-number search filters.
 */
class AuditTrailController extends Controller
{
    public function show(Request $request)
    {
        $departments = DB::select(
            'SELECT id, name FROM departments
             ORDER BY CASE id WHEN 15 THEN 1 WHEN 3 THEN 2 WHEN 1 THEN 3 WHEN 2 THEN 4
             WHEN 4 THEN 5 WHEN 12 THEN 6 WHEN 5 THEN 7 WHEN 6 THEN 8 WHEN 9 THEN 9
             WHEN 7 THEN 10 WHEN 13 THEN 11 WHEN 14 THEN 12 WHEN 8 THEN 13 ELSE 100 END, name ASC'
        );

        $selectedDept = (string) $request->query('department', '');
        $search = trim((string) $request->query('search', ''));

        $hasFilter = ($selectedDept !== '' && $selectedDept !== null) || $search !== '';
        $queueData = [];

        if ($hasFilter) {
            $conditions = [];
            $params = [];

            if ($selectedDept !== '' && $selectedDept !== null && $selectedDept !== 'all') {
                $conditions[] = 'd.id = ?';
                $params[] = $selectedDept;
            }

            if ($search !== '') {
                $conditions[] = 'ql.queue_number LIKE ?';
                $params[] = '%'.$search.'%';
            }

            if (count($conditions) > 0 || $selectedDept === 'all') {
                $where = count($conditions) > 0 ? ' WHERE '.implode(' AND ', $conditions) : '';

                $rows = DB::select(
                    "SELECT ql.id, ql.queue_number, ql.action, ql.created_at, d.name AS department,
                            u.firstname AS user_firstname, u.lastname AS user_lastname
                     FROM queue_log ql
                     JOIN departments d ON ql.department_id = d.id
                     LEFT JOIN users u ON ql.user_id = u.user_id
                     {$where}
                     ORDER BY ql.created_at DESC",
                    $params
                );

                foreach ($rows as $row) {
                    $row->operator = trim(($row->user_firstname ?? '').' '.($row->user_lastname ?? ''));
                    $row->full_queue_number = $row->queue_number;
                    $queueData[] = $row;
                }
            }
        }

        return view('audit_trail', [
            'departments' => $departments,
            'selectedDept' => $selectedDept,
            'search' => $search,
            'hasFilter' => $hasFilter,
            'queueData' => $queueData,
        ]);
    }
}
