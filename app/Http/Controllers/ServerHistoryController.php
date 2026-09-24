<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Port of app/server_history.php: paginated serve log with filters
 * (department / server / date range / queue-number search), sortable
 * columns, and filtered CSV export.
 */
class ServerHistoryController extends Controller
{
    private const PAGE_SIZE = 20;

    /** Sort keys exposed to the UI, mapped to whitelisted ORDER BY expressions. */
    private const SORT_COLUMNS = [
        'num' => 'q.queue_number',
        'server' => 'server_name',
        'staff' => 'server_name',
        'department' => 'd.name',
        'category' => 'q.category',
        'status' => 'q.status',
        'datetime' => 'q.created_at',
        'id' => 'q.id',
    ];

    public function show(Request $request)
    {
        $departments = DB::select(
            'SELECT id, name FROM departments ORDER BY CASE id WHEN 15 THEN 1 WHEN 3 THEN 2 WHEN 1 THEN 3 WHEN 2 THEN 4 WHEN 4 THEN 5 WHEN 12 THEN 6 WHEN 5 THEN 7 WHEN 6 THEN 8 WHEN 9 THEN 9 WHEN 7 THEN 10 WHEN 13 THEN 11 WHEN 14 THEN 12 WHEN 8 THEN 13 ELSE 100 END, name ASC'
        );

        $selectedDept = trim((string) $request->query('department', ''));
        $fromParam = trim((string) $request->query('from', ''));
        $toParam = trim((string) $request->query('to', ''));
        $selectedSid = trim((string) $request->query('sid', ''));
        $queueSearch = trim((string) $request->query('q', ''));

        $hasRange = $fromParam !== '' || $toParam !== '';
        $today = Carbon::now('+08:00')->toDateString();
        $fromDate = $hasRange ? $fromParam : $today;
        $toDate = $hasRange ? $toParam : $today;

        $sortKey = trim((string) $request->query('sort', ''));
        if (! array_key_exists($sortKey, self::SORT_COLUMNS)) {
            $sortKey = '';
        }
        $sortDir = strtolower(trim((string) $request->query('dir', ''))) === 'desc' ? 'desc' : 'asc';
        $orderBy = $sortKey === ''
            ? 'q.created_at DESC'
            : self::SORT_COLUMNS[$sortKey].' '.strtoupper($sortDir).', q.id DESC';

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

        if ($request->query('export') === 'csv') {
            if ((string) $request->query('scope', '') === 'selected') {
                return $this->exportSelected($request, $orderBy);
            }

            $offset = $request->query('scope') === 'page'
                ? (max(1, (int) $request->query('page', 1)) - 1) * self::PAGE_SIZE
                : null;

            return $this->exportCsv($where, $params, $orderBy, $offset);
        }

        $lastUpdated = DB::selectOne(
            'SELECT MAX(q.created_at) AS latest FROM queue q WHERE q.served_by IS NOT NULL'
        );
        $lastUpdatedAt = $lastUpdated->latest ?? null;

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

        $activeFilters = $this->activeFilters($request, $departments, $serverRows, $selectedDept, $selectedSid, $fromDate, $toDate, $queueSearch);

        return view('server_history', [
            'departments' => $departments,
            'serverOptions' => $serverRows,
            'selectedDept' => $selectedDept,
            'fromDate' => $fromDate,
            'toDate' => $toDate,
            'selectedSid' => $selectedSid,
            'queueSearch' => $queueSearch,
            'sortKey' => $sortKey,
            'sortDir' => $sortDir,
            'lastUpdatedAt' => $lastUpdatedAt,
            'activeFilters' => $activeFilters,
        ]);
    }

    /**
     * Summarize the active filters as removable chips. Each entry carries a
     * label and a URL back to the same view minus that filter (sort kept,
     * page reset).
     *
     * @return array<int, array{label: string, removeUrl: string}>
     */
    private function activeFilters(Request $request, array $departments, array $serverRows, string $selectedDept, string $selectedSid, string $fromDate, string $toDate, string $queueSearch): array
    {
        $base = $request->query();
        unset($base['page']);
        $removeUrl = static function (array $drop) use ($base): string {
            $query = $base;
            foreach ($drop as $key) {
                unset($query[$key]);
            }
            $qs = http_build_query($query);

            return 'server_history.php'.($qs !== '' ? '?'.$qs : '');
        };

        $filters = [];
        if ($selectedDept !== '' && $selectedDept !== 'all') {
            $deptName = null;
            foreach ($departments as $dept) {
                if ((string) $dept->id === (string) $selectedDept) {
                    $deptName = $dept->name;
                    break;
                }
            }
            $filters[] = ['label' => 'Department: '.($deptName ?? '#'.$selectedDept), 'removeUrl' => $removeUrl(['department'])];
        }
        if ($selectedSid !== '') {
            $serverName = null;
            foreach ($serverRows as $srv) {
                if ((string) $srv->server_id === (string) $selectedSid) {
                    $serverName = $srv->server_name;
                    break;
                }
            }
            $filters[] = ['label' => 'Server: '.($serverName ?? '#'.$selectedSid), 'removeUrl' => $removeUrl(['sid'])];
        }
        if ($fromDate !== '' || $toDate !== '') {
            if ($fromDate !== '' && $toDate !== '') {
                $range = $fromDate.' → '.$toDate;
            } elseif ($fromDate !== '') {
                $range = 'From '.$fromDate;
            } else {
                $range = 'To '.$toDate;
            }
            $filters[] = ['label' => 'Dates: '.$range, 'removeUrl' => $removeUrl(['from', 'to'])];
        }
        if ($queueSearch !== '') {
            $filters[] = ['label' => 'Queue #: '.$queueSearch, 'removeUrl' => $removeUrl(['q'])];
        }

        return $filters;
    }

    /**
     * Stream the filtered serve log as CSV. Scope "page" exports only the
     * current page window; anything else exports all matching rows.
     */
    private function exportCsv(string $where, array $params, string $orderBy, ?int $offset): StreamedResponse
    {
        $exportParams = $params;
        $paging = '';
        if ($offset !== null) {
            $paging = ' OFFSET ? ROWS FETCH NEXT '.self::PAGE_SIZE.' ROWS ONLY';
            $exportParams[] = $offset;
        }
        $rows = DB::select(
            "SELECT q.queue_number, q.status, q.category, q.created_at,
                    d.name AS department,
                    CONCAT(u.firstname, ' ', u.lastname) AS server_name
             FROM queue q
             JOIN departments d ON q.department_id = d.id
             LEFT JOIN users u ON q.served_by = u.user_id
             WHERE q.served_by IS NOT NULL{$where}
             ORDER BY {$orderBy}{$paging}",
            $exportParams
        );

        $filename = 'server_history_'.now()->format('Ymd_His').'.csv';

        return $this->streamServeRows($rows, $filename);
    }

    /**
     * Stream exactly the checked rows as CSV. Ids arrive as a comma-separated
     * query list; only positive integers are honored (capped), so garbage
     * input yields a headers-only file instead of an error page.
     */
    private function exportSelected(Request $request, string $orderBy): StreamedResponse
    {
        $ids = collect(explode(',', (string) $request->query('ids', '')))
            ->map(static fn ($value) => (int) trim((string) $value))
            ->filter(static fn ($value) => $value > 0)
            ->unique()
            ->take(200)
            ->values()
            ->all();

        $rows = [];
        if (count($ids) > 0) {
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $rows = DB::select(
                "SELECT q.queue_number, q.status, q.category, q.created_at,
                        d.name AS department,
                        CONCAT(u.firstname, ' ', u.lastname) AS server_name
                 FROM queue q
                 JOIN departments d ON q.department_id = d.id
                 LEFT JOIN users u ON q.served_by = u.user_id
                 WHERE q.served_by IS NOT NULL AND q.id IN ({$placeholders})
                 ORDER BY {$orderBy}",
                $ids
            );
        }

        return $this->streamServeRows($rows, 'server_history_selected_'.now()->format('Ymd_His').'.csv');
    }

    /**
     * @param  array<int, object>  $rows
     */
    private function streamServeRows(array $rows, string $filename): StreamedResponse
    {
        return response()->streamDownload(function () use ($rows): void {
            $out = fopen('php://output', 'wb');
            fputcsv($out, ['#', 'Queue #', 'Server', 'Staff', 'Date Range', 'Department', 'Category', 'Status', 'Date/Time']);
            foreach ($rows as $i => $row) {
                fputcsv($out, [
                    $i + 1,
                    (string) $row->queue_number,
                    (string) ($row->server_name ?? ''),
                    (string) ($row->server_name ?? ''),
                    '',
                    (string) $row->department,
                    (string) $row->category,
                    (string) $row->status,
                    (string) $row->created_at,
                ]);
            }
            fclose($out);
        }, $filename, ['Content-Type' => 'text/csv']);
    }
}
