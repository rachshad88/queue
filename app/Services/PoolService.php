<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

/**
 * Cross-clinic mutual help pool + one-serving-row-per-operator guard,
 * ported from the native app (app/pool.php, db.php::acquireOperatorServeLock).
 *
 * A pooled clinic with an empty own waiting list may serve the oldest waiting
 * patient of the other pooled clinics (emergency first, priority second, then
 * FIFO by created_at).
 */
class PoolService
{
    public function __construct(private readonly EmitService $emit) {}

    public function poolClinicIds(): array
    {
        return array_map('intval', config('queue.pool_clinic_ids', [1, 2, 4]));
    }

    public function isPooledDept(int $deptId): bool
    {
        return in_array($deptId, $this->poolClinicIds(), true);
    }

    /**
     * Serialize all serving-state transitions for one operator. MUST be called
     * inside an active transaction (the lock is owned by the transaction and
     * released at commit/rollback). True when the lock was granted.
     */
    public function acquireOperatorServeLock(int $userId): bool
    {
        $rows = DB::select(
            "DECLARE @rc int;
             EXEC @rc = sp_getapplock @Resource = ?, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 8000;
             SELECT @rc AS rc;",
            ['serve_op_'.$userId]
        );
        if (empty($rows[0])) {
            return false;
        }

        // sp_getapplock: rc >= 0 means the lock was granted.
        return (int) $rows[0]->rc >= 0;
    }

    /**
     * Waiting rows across the pool in serve order: emergency, priority, then
     * remaining FIFO by created_at.
     *
     * @return object[] rows with id, department_id, queue_number, category, created_at, department_name
     */
    public function pooledWaitingRows(int $myDept, bool $includeOwner = false): array
    {
        $ids = [];
        foreach ($this->poolClinicIds() as $id) {
            if ($id !== $myDept || $includeOwner) {
                $ids[] = $id;
            }
        }
        if (! $ids) {
            return [];
        }

        $in = implode(',', $ids);

        return DB::select(
            "SELECT q.id, q.department_id, q.queue_number, q.category, q.created_at, d.name AS department_name
             FROM queue q
             JOIN departments d ON d.id = q.department_id
             WHERE q.department_id IN ({$in}) AND q.status = 'waiting'
             ORDER BY CASE q.category WHEN 'emergency' THEN 0 WHEN 'priority' THEN 1 ELSE 2 END, q.created_at ASC"
        );
    }

    /** Count of own waiting patients (holding patients are kept by the owner). */
    public function ownWaitingCount(int $myDept): int
    {
        return (int) DB::table('queue')
            ->where('department_id', $myDept)
            ->where('status', 'waiting')
            ->count();
    }

    /**
     * Atomically move a waiting ticket from another pooled clinic into our
     * clinic and mark it serving. The conditional UPDATE makes double-claims
     * impossible.
     *
     * @return array|null ['queue_number' => ..., 'department_id' => ...] or null if already claimed/unavailable
     */
    public function claimAndServe(int $myDept, int $otherDept, int $queueId, int $userId, ?string $label = null): ?array
    {
        if (! $this->isPooledDept($myDept) || ! $this->isPooledDept($otherDept) || $otherDept === $myDept) {
            return null;
        }

        $affected = DB::update(
            'UPDATE queue SET department_id = ?, status = \'serving\', served_by = ?, served_at = '.config('queue.manila_now')."
             WHERE id = ? AND department_id = ? AND status = 'waiting'
               AND NOT EXISTS (SELECT 1 FROM queue q2 WHERE q2.department_id = ? AND q2.served_by = ? AND q2.status = 'serving')",
            [$myDept, $userId, $queueId, $otherDept, $myDept, $userId]
        );
        if ($affected !== 1) {
            return null;
        }

        $row = DB::table('queue')->select('id', 'queue_number')->where('id', $queueId)->first();
        if (! $row) {
            return null;
        }

        $this->emit->logQueueAction($row->id, (string) $row->queue_number, $otherDept, $userId, 'pool_taken', $myDept, 'waiting', 'waiting');
        $this->emit->logQueueAction($row->id, (string) $row->queue_number, $myDept, $userId, 'serving', $otherDept, 'waiting', 'serving');

        $this->emit->queueUpdated($otherDept);
        $this->emit->serveUpdate($myDept, $userId, null, (string) $row->queue_number, $label);

        return ['queue_number' => $row->queue_number, 'department_id' => $myDept];
    }
}
