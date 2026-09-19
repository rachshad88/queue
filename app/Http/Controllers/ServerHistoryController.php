<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Port of app/server_history.php: paginated serve log with filters
 * (department / server / date range / queue-number search).
 */
class ServerHistoryController extends Controller
{
    private const PAGE_SIZE = 20;

    public function show(Request $request)
    {
        $departments = DB::select(
            'SELECT id, name FROM departments ORDER BY CASE id WHEN 15 THEN 1 WHEN 3 THEN 2 WHEN 1 THEN 3 WHEN 2 THEN 4 WHEN 4 THEN 5 WHEN 12 THEN 6 WHEN 5 THEN 7 WHEN 6 THEN 8 WHEN 9 THEN 9 WHEN 7 THEN 10 WHEN 13 THEN 11 WHEN 14 THEN 12 WHEN 8 THEN 13 ELSE 100 END, name ASC'
        );

        $selectedDept = trim((string) $request->query('department', ''));
        $fromDate = trim((string) $request->query('from', ''));
        $toDate = trim((string) $request->query('to', ''));
        $selectedSid = trim((string) $request->query('sid', ''));
        $queueSearch = trim((string) $request->query('q', ''));
        $page = max(1, (int) $request->query('page', 1));

        $conditions = [];
        $params = [];

        if ($selectedDept !== '' && $selectedDept !== 'all') {
            $conditions[] = 'd.id = ?';
            $params[] = $selectedDept;
        }
        if ($selectedSid !== '') {
            $conditions[] = 'q.served_by = ?';
            $params[] = (int) $selectedSid;
        }
        if ($queueSearch !== '') {
            $conditions[] = 'q.queue_number LIKE ?';
            $params[] = '%'.$queueSearch.'%';
        }
        if ($fromDate !== '') {
            $conditions[] = 'CAST(q.created_at AS date) >= ?';
            $params[] = $fromDate;
        }
        if ($toDate !== '') {
            $conditions[] = 'CAST(q.created_at AS date) <= ?';
            $params[] = $toDate;
        }

        $where = count($conditions) > 0 ? ' AND '.implode(' AND ', $conditions) : '';

        $total = DB::selectOne(
            "SELECT COUNT(*) AS total FROM queue q
             JOIN departments d ON q.department_id = d.id
             LEFT JOIN users u ON q.served_by = u.user_id
             WHERE q.served_by IS NOT NULL{$where}",
            $params
        );
        $totalRecords = (int) ($total->total ?? 0);
        $totalPages = max(1, (int) ceil($totalRecords / self::PAGE_SIZE));
        if ($page > $totalPages) {
            $page = $totalPages;
        }
        $offset = ($page - 1) * self::PAGE_SIZE;

        $listParams = $params;
        $listParams[] = $offset;
        $records = DB::select(
            "SELECT q.id, q.queue_number, q.status, q.category, q.created_at,
                    d.name AS department,
                    u.user_id AS server_id,
                    CONCAT(u.firstname, ' ', u.lastname) AS server_name
             FROM queue q
             JOIN departments d ON q.department_id = d.id
             LEFT JOIN users u ON q.served_by = u.user_id
             WHERE q.served_by IS NOT NULL{$where}
             ORDER BY q.created_at DESC OFFSET ? ROWS FETCH NEXT ".self::PAGE_SIZE.' ROWS ONLY',
            $listParams
        );

        $serverParams = [];
        $serverConds = [];
        if ($selectedDept !== '' && $selectedDept !== 'all') {
            $serverConds[] = 'd.id = ?';
            $serverParams[] = $selectedDept;
        }
        if ($fromDate !== '') {
            $serverConds[] = 'CAST(q.created_at AS date) >= ?';
            $serverParams[] = $fromDate;
        }
        if ($toDate !== '') {
            $serverConds[] = 'CAST(q.created_at AS date) <= ?';
            $serverParams[] = $toDate;
        }
        $serverRows = DB::select(
            "SELECT DISTINCT u.user_id AS server_id, CONCAT(u.firstname, ' ', u.lastname) AS server_name
             FROM queue q
             JOIN departments d ON q.department_id = d.id
             JOIN users u ON q.served_by = u.user_id
             WHERE q.served_by IS NOT NULL"
            .(count($serverConds) > 0 ? ' AND '.implode(' AND ', $serverConds) : '')
            .' ORDER BY server_name ASC',
            $serverParams
        );

        $shownFrom = $totalRecords === 0 ? 0 : $offset + 1;
        $shownTo = min($offset + self::PAGE_SIZE, $totalRecords);

        $baseParams = array_filter([
            'department' => $selectedDept,
            'sid' => $selectedSid,
            'from' => $fromDate,
            'to' => $toDate,
            'q' => $queueSearch,
        ], static fn ($v) => $v !== '' && $v !== null);

        $prevHref = null;
        $nextHref = null;
        if ($page > 1) {
            $prevHref = 'server_history.php?'.http_build_query(array_merge($baseParams, ['page' => $page - 1]));
        }
        if ($page < $totalPages) {
            $nextHref = 'server_history.php?'.http_build_query(array_merge($baseParams, ['page' => $page + 1]));
        }

        return view('server_history', [
            'departments' => $departments,
            'serverOptions' => $serverRows,
            'selectedDept' => $selectedDept,
            'fromDate' => $fromDate,
            'toDate' => $toDate,
            'selectedSid' => $selectedSid,
            'queueSearch' => $queueSearch,
            'records' => $records,
            'page' => $page,
            'totalPages' => $totalPages,
            'totalRecords' => $totalRecords,
            'shownFrom' => $shownFrom,
            'shownTo' => $shownTo,
            'prevHref' => $prevHref,
            'nextHref' => $nextHref,
        ]);
    }
}
