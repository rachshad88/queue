<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Session;

/**
 * Port of app/queue_logs.php: superadmin-only paginated audit log with
 * filters (department / action / operator / date range / queue-number search).
 */
class QueueLogsController extends Controller
{
    private const PAGE_SIZE = 25;

    public function show(Request $request)
    {
        if (! Session::get('is_superadmin', false)) {
            return redirect('index.php');
        }

        $departments = DB::select(
            'SELECT id, name FROM departments ORDER BY CASE id WHEN 15 THEN 1 WHEN 3 THEN 2 WHEN 1 THEN 3 WHEN 2 THEN 4 WHEN 4 THEN 5 WHEN 12 THEN 6 WHEN 5 THEN 7 WHEN 6 THEN 8 WHEN 9 THEN 9 WHEN 7 THEN 10 WHEN 13 THEN 11 WHEN 14 THEN 12 WHEN 8 THEN 13 ELSE 100 END, name ASC'
        );

        $actions = collect(DB::select('SELECT DISTINCT action FROM queue_log ORDER BY action ASC'))
            ->pluck('action')
            ->map(fn ($a) => (string) $a)
            ->all();

        $operators = DB::select(
            "SELECT DISTINCT u.user_id AS uid, RTRIM(u.firstname) + ' ' + RTRIM(u.lastname) AS nm
             FROM queue_log ql JOIN users u ON ql.user_id = u.user_id
             ORDER BY nm ASC"
        );

        $selectedDept = trim((string) $request->query('department', ''));
        $selectedAction = trim((string) $request->query('action', ''));
        $selectedUid = trim((string) $request->query('uid', ''));
        $fromDate = trim((string) $request->query('from', ''));
        $toDate = trim((string) $request->query('to', ''));
        $queueSearch = trim((string) $request->query('q', ''));
        $page = max(1, (int) $request->query('page', 1));

        $conditions = [];
        $params = [];

        if ($selectedDept !== '' && $selectedDept !== 'all') {
            $conditions[] = 'ql.department_id = ?';
            $params[] = (int) $selectedDept;
        }
        if ($selectedAction !== '') {
            $conditions[] = 'ql.action = ?';
            $params[] = $selectedAction;
        }
        if ($selectedUid !== '') {
            $conditions[] = 'ql.user_id = ?';
            $params[] = (int) $selectedUid;
        }
        if ($fromDate !== '') {
            $conditions[] = 'CAST(ql.created_at AS date) >= ?';
            $params[] = $fromDate;
        }
        if ($toDate !== '') {
            $conditions[] = 'CAST(ql.created_at AS date) <= ?';
            $params[] = $toDate;
        }
        if ($queueSearch !== '') {
            $conditions[] = 'ql.queue_number LIKE ?';
            $params[] = '%'.$queueSearch.'%';
        }

        $where = count($conditions) > 0 ? ' WHERE '.implode(' AND ', $conditions) : '';

        $total = DB::selectOne(
            "SELECT COUNT(*) AS total FROM queue_log ql
             JOIN departments d ON ql.department_id = d.id
             LEFT JOIN users u ON ql.user_id = u.user_id{$where}",
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
        $listParams[] = self::PAGE_SIZE;
        $records = DB::select(
            "SELECT ql.id, ql.queue_number, ql.action, ql.old_status, ql.new_status,
                    ql.client_ip, ql.created_at, d.name AS department,
                    CONCAT(u.firstname, ' ', u.lastname) AS operator_name, u.username
             FROM queue_log ql
             JOIN departments d ON ql.department_id = d.id
             LEFT JOIN users u ON ql.user_id = u.user_id{$where}
             ORDER BY ql.created_at DESC
             OFFSET ? ROWS FETCH NEXT ".self::PAGE_SIZE.' ROWS ONLY',
            $listParams
        );

        $shownFrom = $totalRecords === 0 ? 0 : $offset + 1;
        $shownTo = min($offset + self::PAGE_SIZE, $totalRecords);

        $baseParams = array_filter([
            'department' => $selectedDept,
            'action' => $selectedAction,
            'uid' => $selectedUid,
            'from' => $fromDate,
            'to' => $toDate,
            'q' => $queueSearch,
        ], static fn ($v) => $v !== '' && $v !== null);

        $prevHref = null;
        $nextHref = null;
        if ($page > 1) {
            $prevHref = 'queue_logs.php?'.http_build_query(array_merge($baseParams, ['page' => $page - 1]));
        }
        if ($page < $totalPages) {
            $nextHref = 'queue_logs.php?'.http_build_query(array_merge($baseParams, ['page' => $page + 1]));
        }

        return view('queue_logs', [
            'departments' => $departments,
            'actions' => $actions,
            'operators' => $operators,
            'selectedDept' => $selectedDept,
            'selectedAction' => $selectedAction,
            'selectedUid' => $selectedUid,
            'fromDate' => $fromDate,
            'toDate' => $toDate,
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
