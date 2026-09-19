<?php

namespace App\Http\Controllers;

use App\Services\EmitService;
use App\Services\PoolService;
use App\Services\SingleLoginService;
use App\Services\StationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Session;

/**
 * Port of the native controller + JSON servicing endpoints:
 *
 *   index.php          controller page (takeover panel, pooled-clinic panel)
 *   get_queue.php      polling endpoint (waiting/serving rows per dept)
 *   serve_next.php     claim the next patient (with pool fallback)
 *   finish.php         retire the current serving row
 *   queue_action.php   serve (approved) / hold / unhold / remove
 *   repeat_call.php    re-broadcast the current queue number
 */
class QueueController extends Controller
{
    public function index(StationService $stations)
    {
        $deptId = (int) Session::get('department_id', 0);
        $userId = (int) Session::get('user_id', 0);
        $isSuperadmin = ! empty(Session::get('is_superadmin', false));

        $deptName = '';
        $deptServer = '';
        if ($deptId > 0) {
            $dept = DB::table('departments')->select('name', 'server')->where('id', $deptId)->first();
            if ($dept) {
                $deptName = (string) $dept->name;
                $deptServer = isset($dept->server) ? (string) $dept->server : '';
            }
        }

        // Heartbeat: mark this staffer's station active so the stale-station
        // reaper (runs on login) never boots someone who is still working.
        $stations->markSectionActivity($userId);

        $activeSectionTable = $stations->sectionsTableForDept($deptId, $deptName);
        $activeWindow = null;
        if ($activeSectionTable !== null) {
            $window = $stations->operatorSection($userId, $deptId);
            if ($window) {
                $activeWindow = (string) $window->section_name;
            }
        }

        // Window picker data for the takeover panel (superadmin only).
        $takeoverSections = [];
        if ($activeSectionTable !== null && $isSuperadmin) {
            $takeoverSections = DB::select(
                "SELECT s.id, s.section_name, s.occupied_by,
                        CASE WHEN u.user_id IS NOT NULL THEN RTRIM(u.firstname) + ' ' + RTRIM(u.lastname) ELSE NULL END AS staff
                 FROM {$activeSectionTable} s
                 LEFT JOIN users u ON s.occupied_by = u.user_id
                 ORDER BY s.id ASC"
            );
        }

        // Departments for the takeover dropdown + transfer modal.
        $departments = DB::table('departments')
            ->select('id', 'name', 'server')
            ->where(function ($q) use ($deptId, $isSuperadmin) {
                $q->whereRaw("(status IS NULL OR LOWER(status) != 'inactive')");
                if (! $isSuperadmin) {
                    $q->where('id', '!=', $deptId);
                }
            })
            ->orderByRaw('CASE id WHEN 15 THEN 1 WHEN 3 THEN 2 WHEN 1 THEN 3 WHEN 2 THEN 4 WHEN 4 THEN 5 WHEN 12 THEN 6 WHEN 5 THEN 7 WHEN 6 THEN 8 WHEN 9 THEN 9 WHEN 7 THEN 10 WHEN 13 THEN 11 WHEN 14 THEN 12 WHEN 8 THEN 13 ELSE 100 END, name ASC')
            ->get();

        // Change-password prompt: shown once per login/session.
        $showChangePw = false;
        if (Session::get('default_pw') === true && empty(Session::get('default_pw_shown'))) {
            Session::put('default_pw_shown', true);
            $showChangePw = true;
        }

        $inPoolClinic = in_array($deptId, array_map('intval', config('queue.pool_clinic_ids', [1, 2, 4])), true);

        return view('queue.index', [
            'deptName' => $deptName,
            'deptServer' => $deptServer,
            'activeSectionTable' => $activeSectionTable,
            'activeWindow' => $activeWindow,
            'takeoverSections' => $takeoverSections,
            'departments' => $departments,
            'inPoolClinic' => $inPoolClinic,
            'showChangePw' => $showChangePw,
        ]);
    }

    public function getQueue(Request $request, StationService $stations)
    {
        $sessionUserId = (int) Session::get('user_id', 0);
        $departmentId = (int) $request->query('department_id', 0);
        $userId = (int) $request->query('user_id', 0);
        $isSuperadmin = ! empty(Session::get('is_superadmin', false));

        // IDOR guard: unless superadmin, users may only query their own queues.
        if (! $isSuperadmin && $userId && $userId !== $sessionUserId) {
            return response()->json(['success' => false, 'message' => 'Access denied']);
        }

        if (! $departmentId) {
            return response()->json(['success' => false, 'message' => 'Department ID is required.']);
        }

        // Department scoping: unless superadmin, only the session department.
        if (! $isSuperadmin && $departmentId !== (int) Session::get('department_id', 0)) {
            return response()->json(['success' => false, 'message' => 'Access denied']);
        }

        $result = ['success' => true, 'queues' => [], 'department_name' => ''];
        $result['department_name'] = (string) DB::table('departments')->where('id', $departmentId)->value('name') ?? '';

        $isSectioned = in_array($departmentId, [(int) config('queue.admission_dept_id'), (int) config('queue.waiting_dept_id')], true);

        if ($isSectioned) {
            $tables = [
                (int) config('queue.waiting_dept_id') => 'waiting_sections',
                (int) config('queue.admission_dept_id') => 'admission_sections',
            ];
            $sectionsTable = $tables[$departmentId];

            $canServePriority = 0;
            $section = $stations->operatorSection($userId ?: $sessionUserId, $departmentId);
            if ($section) {
                $canServePriority = $stations->sectionServesPriority((int) $section->id, $sectionsTable) ? 1 : 0;
            }

            $serving = DB::select(
                "SELECT id, queue_number, status, category FROM queue
                 WHERE department_id=? AND served_by=? AND LOWER(status)='serving'",
                [$departmentId, $userId ?: $sessionUserId]
            );
            foreach ($serving as $row) {
                $result['queues'][] = [
                    'id' => (int) $row->id,
                    'queue_number' => (string) $row->queue_number,
                    'status' => $row->status,
                    'served_by' => $userId ?: $sessionUserId,
                    'category' => $row->category ?? 'regular',
                ];
            }

            if ($canServePriority) {
                $waiting = DB::select(
                    "SELECT id, queue_number, status, category FROM queue WHERE department_id=? AND status IN ('waiting','hold')
                     ORDER BY CASE category WHEN 'emergency' THEN 0 WHEN 'priority' THEN 1 ELSE 2 END, created_at ASC",
                    [$departmentId]
                );
            } else {
                $waiting = DB::select(
                    "SELECT id, queue_number, status, category FROM queue WHERE department_id=? AND status IN ('waiting','hold') AND category='regular'
                     ORDER BY created_at ASC",
                    [$departmentId]
                );
            }
            foreach ($waiting as $w) {
                $result['queues'][] = [
                    'id' => (int) $w->id,
                    'queue_number' => (string) $w->queue_number,
                    'status' => $w->status,
                    'served_by' => null,
                    'category' => $w->category ?? 'regular',
                ];
            }
        } else {
            $rows = DB::select(
                "SELECT id, queue_number, status, served_by, category FROM queue
                 WHERE department_id=?
                   AND LOWER(status) IN ('waiting','serving','hold')
                 ORDER BY CASE WHEN LOWER(status)='serving' THEN 0
                               WHEN category='emergency' THEN 1
                               WHEN category='priority' THEN 2 ELSE 3 END,
                          CASE WHEN LOWER(status)='serving' THEN created_at END DESC,
                          created_at ASC",
                [$departmentId]
            );
            foreach ($rows as $q) {
                $result['queues'][] = [
                    'id' => (int) $q->id,
                    'queue_number' => (string) $q->queue_number,
                    'status' => $q->status,
                    'served_by' => isset($q->served_by) ? (int) $q->served_by : null,
                    'category' => $q->category ?? 'regular',
                ];
            }
        }

        return response()->json($result);
    }

    public function serveNext(Request $request, EmitService $emit, PoolService $pool, StationService $stations, SingleLoginService $singleLogin)
    {
        $servedBy = (int) Session::get('user_id', 0);
        $departmentId = (int) $request->input('department_id', 0);
        $isSuperadmin = ! empty(Session::get('is_superadmin', false));

        // Stamp the serving device: client IP -> users (last_ip/last_active).
        if ($servedBy > 0) {
            $singleLogin->stampActivity($servedBy, $singleLogin->clientIp($request));
        }

        if (! $servedBy || ! $departmentId) {
            return response()->json(['success' => false, 'message' => 'Invalid department or user.']);
        }

        // Non-superadmins can only serve queues in their own department.
        if (! $isSuperadmin && (int) Session::get('department_id', 0) !== $departmentId) {
            return response()->json(['success' => false, 'message' => 'Access denied for this department.']);
        }

        // Self-heal: rows stuck in 'serving' for >60 minutes are abandoned
        // sessions (crash, closed browser, staff switch). Finish them so the
        // "Now Serving" display and Repeat Call never freeze on stale numbers.
        $stale = DB::select(
            'SELECT TOP 50 id, queue_number FROM queue
             WHERE department_id = ? AND status = \'serving\'
               AND served_at IS NOT NULL AND served_at < DATEADD(MINUTE, -60, '.config('queue.manila_now').')',
            [$departmentId]
        );
        foreach ($stale as $s) {
            $upd = DB::update("UPDATE queue SET status='done' WHERE id=? AND status='serving'", [(int) $s->id]);
            if ($upd === 1) {
                $emit->logQueueAction((int) $s->id, (string) $s->queue_number, $departmentId, $servedBy, 'auto_done_stale', null, 'serving', 'done');
            }
        }

        $isSectioned = in_array($departmentId, [(int) config('queue.admission_dept_id'), (int) config('queue.waiting_dept_id')], true);

        if ($isSectioned) {
            $isWaiting = $departmentId === (int) config('queue.waiting_dept_id');
            $sectionsTable = $isWaiting ? 'waiting_sections' : 'admission_sections';
            $sectionLabel = $isWaiting ? 'waiting section' : 'admission section';

            $section = $stations->operatorSection($servedBy, $departmentId);
            $sectionId = $section->id ?? null;
            if (! $sectionId) {
                $msg = $isSuperadmin ? 'Select a '.$sectionLabel.' window first.' : 'Not assigned to '.$sectionLabel.'.';

                return response()->json(['success' => false, 'message' => $msg]);
            }
            $canServePriority = $stations->sectionServesPriority((int) $sectionId, $sectionsTable);

            $check = DB::select(
                "SELECT TOP 1 id, queue_number FROM queue WHERE department_id=? AND served_by=? AND status='serving'",
                [$departmentId, $servedBy]
            );
            if ($check) {
                $emit->serveUpdate($departmentId, $servedBy, $sectionId, (string) $check[0]->queue_number, $section->section_name ?? null);

                return response()->json(['success' => true, 'queue_number' => (string) $check[0]->queue_number, 'message' => 'Already serving this queue.']);
            }

            $orders = $canServePriority
                ? ['emergency', 'priority', 'regular']
                : ['regular'];

            foreach ($orders as $category) {
                $row = DB::select(
                    "SELECT TOP 1 id, queue_number FROM queue WHERE department_id=? AND status='waiting' AND category=? ORDER BY created_at ASC",
                    [$departmentId, $category]
                );
                if (! $row) {
                    continue;
                }
                DB::update(
                    "UPDATE queue SET status='serving',served_by=?,served_at=".config('queue.manila_now').' WHERE id=?',
                    [$servedBy, (int) $row[0]->id]
                );
                $emit->logQueueAction((int) $row[0]->id, (string) $row[0]->queue_number, $departmentId, $servedBy, 'serving', null, 'waiting', 'serving');
                $emit->serveUpdate($departmentId, $servedBy, $sectionId, (string) $row[0]->queue_number, $section->section_name ?? null);

                return response()->json(['success' => true, 'queue_number' => (string) $row[0]->queue_number]);
            }

            return response()->json(['success' => false, 'message' => 'No patients waiting.']);
        }

        // One operator can hold at most one serving row at a time. Run the whole
        // finish-then-serve sequence under an exclusive per-operator app lock so
        // concurrent double-submits can never produce two serving rows.
        DB::beginTransaction();
        if (! $pool->acquireOperatorServeLock($servedBy)) {
            DB::rollBack();

            return response()->json(['success' => false, 'message' => 'Another serve is already in progress.']);
        }

        try {
            // 1) Finish-then-serve: retire the operator's current serving row (if any).
            $current = DB::select(
                "SELECT id, queue_number FROM queue WHERE department_id=? AND status='serving' AND served_by=?",
                [$departmentId, $servedBy]
            );
            foreach ($current as $cur) {
                $upd = DB::update("UPDATE queue SET status='done' WHERE id=? AND status='serving'", [(int) $cur->id]);
                if ($upd === 1) {
                    $emit->logQueueAction((int) $cur->id, (string) $cur->queue_number, $departmentId, $servedBy, 'finished', null, 'serving', 'done');
                }
            }

            // 2) Atomically claim the next waiting patient.
            $row = DB::select(
                "SELECT TOP 1 id, queue_number FROM queue WHERE department_id=? AND status='waiting'
                 ORDER BY CASE category WHEN 'emergency' THEN 0 WHEN 'priority' THEN 1 ELSE 2 END, created_at ASC",
                [$departmentId]
            );
            if ($row) {
                $upd = DB::update(
                    "UPDATE queue SET status='serving',served_by=?,served_at=".config('queue.manila_now')."
                     WHERE id=? AND department_id=? AND status='waiting'
                       AND NOT EXISTS (SELECT 1 FROM queue q2 WHERE q2.department_id=? AND q2.served_by=? AND q2.status='serving')",
                    [$servedBy, (int) $row[0]->id, $departmentId, $departmentId, $servedBy]
                );
                if ($upd === 1) {
                    $emit->logQueueAction((int) $row[0]->id, (string) $row[0]->queue_number, $departmentId, $servedBy, 'serving', null, 'waiting', 'serving');
                    $emit->serveUpdate($departmentId, $servedBy, null, (string) $row[0]->queue_number, $this->departmentName($departmentId));
                    DB::commit();

                    return response()->json(['success' => true, 'queue_number' => (string) $row[0]->queue_number]);
                }
                // The chosen row was taken by another transition; fall through to the pool.
            }

            // 3) Cross-clinic mutual help: if this is a pooled clinic (1/2/4)
            // with no waiting patients of its own, take the oldest waiting
            // patient across the other clinics.
            if ($pool->isPooledDept($departmentId)) {
                $poolRows = $pool->pooledWaitingRows($departmentId);
                if ($poolRows) {
                    $pick = $poolRows[0];
                    $claimed = $pool->claimAndServe($departmentId, (int) $pick->department_id, (int) $pick->id, $servedBy, $this->departmentName($departmentId));
                    if ($claimed) {
                        DB::commit();

                        return response()->json(['success' => true, 'queue_number' => (string) $claimed['queue_number'], 'pool' => true]);
                    }
                }
            }

            // Nothing left: roll back so a current serving row (if any) survives.
            DB::rollBack();

            return response()->json(['success' => false, 'message' => 'No patients waiting.']);
        } catch (\Throwable $e) {
            DB::rollBack();

            return response()->json(['success' => false, 'message' => 'Could not serve the next patient.']);
        }
    }

    public function finish(Request $request, EmitService $emit)
    {
        $departmentId = (int) $request->input('department_id', 0);
        $servedBy = (int) Session::get('user_id', 0);
        $isSuperadmin = ! empty(Session::get('is_superadmin', false));

        if (! $servedBy) {
            return response()->json(['success' => false, 'message' => 'Not logged in']);
        }

        if (! $departmentId) {
            return response()->json(['success' => false, 'message' => 'Invalid department']);
        }

        // Non-superadmins can only finish queues in their own department.
        if (! $isSuperadmin && (int) Session::get('department_id', 0) !== $departmentId) {
            return response()->json(['success' => false, 'message' => 'Access denied for this department']);
        }

        // Capture the serving row before the update for audit logging.
        $servingRow = DB::table('queue')
            ->select('id', 'queue_number')
            ->where('department_id', $departmentId)
            ->where('status', 'serving')
            ->where('served_by', $servedBy)
            ->first();

        $affected = DB::table('queue')
            ->where('department_id', $departmentId)
            ->where('served_by', $servedBy)
            ->where('status', 'serving')
            ->update(['status' => 'done']);

        if ($affected !== false) {
            if ($servingRow) {
                $emit->logQueueAction((int) $servingRow->id, (string) $servingRow->queue_number, $departmentId, $servedBy, 'finished', null, 'serving', 'done');
            }
            $emit->queueUpdated($departmentId);

            return response()->json(['success' => true, 'message' => 'Queue marked as done.']);
        }

        return response()->json(['success' => false, 'message' => 'Failed to update queue status.']);
    }

    public function queueAction(Request $request, EmitService $emit, PoolService $pool, StationService $stations)
    {
        $departmentId = (int) Session::get('department_id', 0);
        $userId = (int) Session::get('user_id', 0);
        $action = strtolower(trim((string) $request->input('action', '')));
        $queueId = (int) $request->input('queue_id', 0);

        if (! in_array($action, ['serve', 'hold', 'unhold', 'remove'], true)) {
            return response()->json(['success' => false, 'message' => 'Invalid action']);
        }

        if (! $queueId) {
            return response()->json(['success' => false, 'message' => 'Queue ID is required']);
        }

        // Fetch the queue row, scoped to the operator's department.
        $row = DB::table('queue')
            ->select('id', 'queue_number', 'status', 'served_by', 'department_id')
            ->where('id', $queueId)
            ->where('department_id', $departmentId)
            ->first();

        if (! $row) {
            return response()->json(['success' => false, 'message' => 'Queue not found in this department']);
        }

        $current = strtolower(trim((string) $row->status));
        $newStatus = null;
        $isSectioned = in_array($departmentId, [(int) config('queue.admission_dept_id'), (int) config('queue.waiting_dept_id')], true);

        switch ($action) {
            case 'serve':
                if ($current !== 'waiting') {
                    return response()->json(['success' => false, 'message' => 'Only waiting queues can be served']);
                }

                $approval = $this->verifyServeApproval((string) $request->input('approver_password', ''));
                if (! $approval['ok']) {
                    return response()->json(['success' => false, 'message' => $approval['error']]);
                }

                DB::beginTransaction();
                if (! $pool->acquireOperatorServeLock($userId)) {
                    DB::rollBack();

                    return response()->json(['success' => false, 'message' => 'Another serve is already in progress.']);
                }
                if ($isSectioned) {
                    $hasServing = DB::table('queue')
                        ->where('department_id', $departmentId)
                        ->where('served_by', $userId)
                        ->where('status', 'serving')
                        ->exists();
                    if ($hasServing) {
                        DB::rollBack();

                        return response()->json(['success' => false, 'message' => 'Finish or transfer the current patient before serving another.']);
                    }
                }
                // Finish this operator's currently-serving rows first (mirrors Serve Next).
                $serveLeads = DB::select(
                    "SELECT id, queue_number FROM queue WHERE department_id=? AND served_by=? AND status='serving'",
                    [$departmentId, $userId]
                );
                foreach ($serveLeads as $sl) {
                    $upd = DB::update("UPDATE queue SET status='done' WHERE id=? AND status='serving'", [(int) $sl->id]);
                    if ($upd === 1) {
                        $emit->logQueueAction((int) $sl->id, (string) $sl->queue_number, $departmentId, $userId, 'finished', null, 'serving', 'done');
                    }
                }
                $newStatus = 'serving';
                break;

            case 'hold':
                if (! in_array($current, ['waiting', 'serving'], true)) {
                    return response()->json(['success' => false, 'message' => 'Only waiting or serving queues can be held']);
                }
                $newStatus = 'hold';
                break;

            case 'unhold':
                if ($current !== 'hold') {
                    return response()->json(['success' => false, 'message' => 'Only held queues can be unheld']);
                }
                $newStatus = 'waiting';
                break;

            case 'remove':
                if (! in_array($current, ['waiting', 'hold'], true)) {
                    return response()->json(['success' => false, 'message' => 'Only waiting or held queues can be removed']);
                }
                $newStatus = 'done';
                break;
        }

        // 'serve' claims the patient for this operator (status=serving + served_by).
        // All other actions clear served_by; hold/done retire the window.
        if ($newStatus === 'serving') {
            $affected = DB::update(
                "UPDATE queue SET status='serving', served_by=?, served_at=".config('queue.manila_now')."
                 WHERE id=? AND status='waiting'
                   AND NOT EXISTS (SELECT 1 FROM queue q2
                                   WHERE q2.department_id=? AND q2.served_by=? AND q2.status='serving' AND q2.id<>?)",
                [$userId, $queueId, $departmentId, $userId, $queueId]
            );
            if ($affected !== 1) {
                DB::rollBack();

                return response()->json(['success' => false, 'message' => 'This patient was already taken, or you are already serving a queue.']);
            }
            DB::commit();
        } else {
            DB::table('queue')
                ->where('id', $queueId)
                ->update(['status' => $newStatus, 'served_by' => null]);
        }

        $emit->logQueueAction((int) $row->id, (string) $row->queue_number, $departmentId, $userId, $action, null, $current, $newStatus);

        // Carry the served number (and window label for sectioned depts) so live
        // monitors announce a serve immediately, matching serve_next.php behavior.
        $payload = ['dept' => $departmentId];
        if ($action === 'serve') {
            $payload['queue_number'] = (string) $row->queue_number;
            $section = null;
            $secTable = $stations->sectionsTableForDept($departmentId);
            if ($secTable !== null) {
                $opSec = $stations->operatorSection($userId, $departmentId);
                $section = $opSec->section_name ?? null;
            }
            if ($section !== null && $section !== '') {
                $payload['section'] = (string) $section;
            }
        }
        $emit->emit('queue-updated', $payload);

        return response()->json([
            'success' => true,
            'queue_number' => (string) $row->queue_number,
            'action' => $action,
            'message' => 'Queue '.$action.' successful',
        ]);
    }

    public function repeatCall(Request $request, EmitService $emit)
    {
        $servedBy = (int) Session::get('user_id', 0);
        $departmentId = (int) $request->input('department_id', 0);
        $queueNumber = trim((string) $request->input('queue_number', ''));
        $departmentName = trim((string) $request->input('department_name', ''));
        $isSuperadmin = ! empty(Session::get('is_superadmin', false));

        if (! $servedBy) {
            return response()->json(['success' => false, 'message' => 'Not logged in']);
        }

        if (! $departmentId || $queueNumber === '') {
            return response()->json(['success' => false, 'message' => 'department_id and queue_number are required']);
        }

        // Non-superadmins can only broadcast repeats for their own department.
        if (! $isSuperadmin && (int) Session::get('department_id', 0) !== $departmentId) {
            return response()->json(['success' => false, 'message' => 'Access denied for this department.']);
        }

        $emit->emit('repeat-call', [
            'department_id' => $departmentId,
            'department_name' => $departmentName,
            'queue_number' => $queueNumber,
            'user_id' => $servedBy,
        ]);

        return response()->json(['success' => true]);
    }

    private function departmentName(int $departmentId): ?string
    {
        $name = DB::table('departments')->where('id', $departmentId)->value('name');

        return $name !== null ? (string) $name : null;
    }

    /**
     * Physician/admin approval gate for the "Serve" row action. Only the
     * password is submitted: an active physician (CLINIC 1/2/3/4) or an admin
     * (usertype admin/superadmin) whose hash matches it grants approval.
     *
     * @return array{ok: bool, error?: string}
     */
    private function verifyServeApproval(string $password): array
    {
        if ($password === '') {
            return ['ok' => false, 'error' => 'Physician/Admin approval required'];
        }

        $physDepts = DB::table('departments')
            ->whereIn(DB::raw('UPPER(TRIM(name))'), ['CLINIC 1', 'CLINIC 2', 'CLINIC 3', 'CLINIC 4'])
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();
        if (empty($physDepts)) {
            return ['ok' => false, 'error' => 'No physician departments configured'];
        }

        $in = implode(',', array_map('intval', $physDepts));
        $rows = DB::select(
            "SELECT u.password FROM users u LEFT JOIN departments d ON d.id = u.department_id
             WHERE u.status = 'active'
               AND (d.status IS NULL OR LOWER(d.status) != 'inactive')
               AND (u.department_id IN ({$in}) OR LOWER(u.usertype) IN ('admin', 'superadmin'))"
        );
        if (empty($rows)) {
            return ['ok' => false, 'error' => 'Approval check failed'];
        }

        foreach ($rows as $a) {
            if (! empty($a->password) && password_verify($password, (string) $a->password)) {
                return ['ok' => true];
            }
        }

        return ['ok' => false, 'error' => 'Invalid credentials'];
    }
}
