<?php

namespace App\Http\Controllers;

use App\Services\StationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Port of the public display endpoints: app/get_display_data.php (single dept
 * display board) + app/get_live_serving.php (multi-dept monitoring wall).
 * Both are deliberately unauthenticated.
 */
class DisplayController extends Controller
{
    public function display(Request $request)
    {
        $departmentId = (int) $request->query('department_id', 0);

        if ($departmentId <= 0) {
            return response()->json(['serving' => [], 'waiting' => [], 'is_admission' => false]);
        }

        $deptName = (string) DB::table('departments')->where('id', $departmentId)->value('name') ?? '';
        $isAdmission = strpos(strtolower($deptName), 'admission') !== false;

        $serving = [];

        if ($isAdmission) {
            $sections = DB::select(
                'SELECT id, section_name, occupied_by FROM admission_sections WHERE status = 1 ORDER BY id ASC'
            );
            foreach ($sections as $s) {
                $item = [
                    'section_id' => (int) $s->id,
                    'section_name' => (string) $s->section_name,
                    'queue_number' => '-',
                    'served_by' => (int) ($s->occupied_by ?? 0),
                    'category' => 'regular',
                ];
                if (! empty($s->occupied_by)) {
                    $q = DB::selectOne(
                        "SELECT TOP 1 queue_number, category FROM queue
                         WHERE department_id = ? AND served_by = ? AND status = 'SERVING' ORDER BY created_at ASC",
                        [$departmentId, (int) $s->occupied_by]
                    );
                    if ($q) {
                        $item['queue_number'] = (string) $q->queue_number;
                        $item['category'] = (string) ($q->category ?? 'regular');
                    }
                }
                $serving[] = $item;
            }
        } else {
            $q = DB::selectOne(
                "SELECT TOP(1) d.name AS department_name, q.queue_number, q.served_by, q.category
                 FROM queue q JOIN departments d ON d.id = q.department_id
                 WHERE q.department_id = ? AND q.status = 'SERVING' ORDER BY q.created_at ASC",
                [$departmentId]
            );
            if ($q) {
                $serving[] = [
                    'department_name' => (string) $q->department_name,
                    'queue_number' => (string) $q->queue_number,
                    'served_by' => (int) ($q->served_by ?? 0),
                    'category' => (string) ($q->category ?? 'regular'),
                ];
            }
        }

        $waiting = [];
        $waits = DB::select(
            "SELECT TOP(10) q.queue_number, q.category FROM queue q
             WHERE q.department_id = ? AND q.status = 'WAITING'
             ORDER BY CASE q.category WHEN 'emergency' THEN 0 WHEN 'priority' THEN 1 ELSE 2 END, q.created_at ASC",
            [$departmentId]
        );
        foreach ($waits as $w) {
            $waiting[] = [
                'queue_number' => (string) $w->queue_number,
                'category' => (string) ($w->category ?? 'regular'),
            ];
        }

        return response()->json([
            'serving' => $serving,
            'waiting' => $waiting,
            'is_admission' => $isAdmission,
        ]);
    }

    public function liveServing(Request $request, StationService $stations)
    {
        $ids = array_values(array_filter(
            array_map('intval', explode(',', (string) $request->query('ids', ''))),
            fn ($id) => $id > 0
        ));
        $ids = array_slice($ids, 0, 12);

        $result = [];
        foreach ($ids as $deptId) {
            $dept = DB::table('departments')->select('id', 'name', 'server')->where('id', $deptId)->first();
            if (! $dept) {
                continue;
            }

            // Manila calendar day (not the server-UTC day): the live wall must
            // agree with the rest of the queue on what "today" means.
            $manilaToday = config('queue.manila_today');

            $entry = [
                'id' => (int) $dept->id,
                'name' => (string) $dept->name,
                'server' => isset($dept->server) && (string) $dept->server !== '' ? (string) $dept->server : null,
                'is_admission' => stripos((string) $dept->name, 'admission') !== false,
                'is_sectioned' => $stations->sectionsTableForDept((int) $dept->id, (string) $dept->name) !== null,
                'serving' => [],
                'waiting' => [],
                'waiting_total' => (int) DB::table('queue')
                    ->where('department_id', $deptId)
                    ->where('status', 'waiting')
                    ->whereRaw('created_at >= '.$manilaToday)
                    ->count(),
            ];

            if ($entry['is_sectioned']) {
                $table = $stations->sectionsTableForDept((int) $dept->id, (string) $dept->name);
                $sections = DB::select(
                    "SELECT s.id, s.section_name, s.occupied_by,
                            CASE WHEN u.user_id IS NOT NULL THEN RTRIM(u.firstname) + ' ' + RTRIM(u.lastname) ELSE NULL END AS staff
                     FROM {$table} s
                     LEFT JOIN users u ON s.occupied_by = u.user_id
                     ORDER BY s.id ASC"
                );
                foreach ($sections as $s) {
                    $item = [
                        'section' => (string) $s->section_name,
                        'queue_number' => '-',
                        'category' => 'regular',
                        'staff' => isset($s->staff) ? (string) $s->staff : null,
                    ];
                    if (! empty($s->occupied_by)) {
                        $q = DB::selectOne(
                            "SELECT TOP 1 queue_number, category FROM queue
                              WHERE department_id = ? AND served_by = ? AND status = 'serving' AND created_at >= {$manilaToday} ORDER BY created_at ASC",
                            [$deptId, (int) $s->occupied_by]
                        );
                        if ($q) {
                            $item['queue_number'] = (string) $q->queue_number;
                            $item['category'] = (string) ($q->category ?? 'regular');
                        }
                    }
                    $entry['serving'][] = $item;
                }
            } else {
                // Current serving rows for the dept (matches get_display_data.php:
                // "who is the doctor seeing now"). No 45-min served_at window -- a
                // long consultation (or a stale row) must never make the wall go
                // idle while status is still 'serving'.
                $live = DB::select(
                    "SELECT TOP 4 queue_number, category FROM queue
                      WHERE department_id = ? AND status = 'serving' AND created_at >= {$manilaToday}
                      ORDER BY served_at DESC",
                    [$deptId]
                );
                foreach ($live as $q) {
                    $entry['serving'][] = [
                        'queue_number' => (string) $q->queue_number,
                        'category' => (string) ($q->category ?? 'regular'),
                    ];
                }
            }

            // Today's records only: the live wall shows no cross-day backlog.
            $waits = DB::select(
                "SELECT TOP 10 id, queue_number, status, category FROM queue
                  WHERE department_id = ? AND status = 'waiting' AND created_at >= {$manilaToday}
                  ORDER BY CASE category WHEN 'emergency' THEN 0 WHEN 'priority' THEN 1 ELSE 2 END, created_at ASC",
                [$deptId]
            );
            foreach ($waits as $w) {
                $entry['waiting'][] = [
                    'id' => (int) $w->id,
                    'queue_number' => (string) $w->queue_number,
                    'category' => (string) ($w->category ?? 'regular'),
                ];
            }

            $result[] = $entry;
        }

        return response($result)
            ->withHeaders([
                'Cache-Control' => 'no-store, no-cache, must-revalidate',
                'Pragma' => 'no-cache',
                'Expires' => 0,
            ])
            ->header('Content-Type', 'application/json');
    }
}
