<?php

namespace App\Http\Controllers;

use App\Services\EmitService;
use App\Services\QueueNumbersService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Session;

/**
 * Port of app/transfer_queue.php + app/prioritize_queue.php:
 *
 *   transfer_queue.php    move the operator's current serving patient to another dept
 *   prioritize_queue.php  LABORATORY-only: re-queue a returning patient by return code
 */
class TransferController extends Controller
{
    public function transfer(Request $request, EmitService $emit)
    {
        $userId = (int) Session::get('user_id', 0);
        $sourceDept = (int) Session::get('department_id', 0);
        $targetDept = (int) $request->input('department_id', 0);

        if (! $sourceDept || ! $targetDept) {
            return response()->json(['success' => false, 'message' => 'Invalid department']);
        }

        if ($sourceDept === $targetDept) {
            return response()->json(['success' => false, 'message' => 'Cannot transfer to the same department']);
        }

        $targetStatus = DB::table('departments')->where('id', $targetDept)->value('status');
        if ($targetStatus === null
            || (is_string($targetStatus) && strtolower(trim($targetStatus)) === 'inactive')) {
            return response()->json(['success' => false, 'message' => 'Target department is inactive']);
        }

        $row = DB::selectOne(
            "SELECT TOP 1 id, queue_number FROM queue
             WHERE department_id = ? AND served_by = ? AND status = 'serving' ORDER BY created_at ASC",
            [$sourceDept, $userId]
        );
        if (! $row) {
            return response()->json(['success' => false, 'message' => 'No patient currently being served']);
        }

        // Category promotion: E- stays emergency, P- stays priority. For R- (and
        // other) tickets the Lab promotion keeps priority only when the transfer
        // originates from the LABORATORY into CLINIC 1/2/3/ADMISSION.
        $keepIds = DB::table('departments')
            ->whereIn(DB::raw('UPPER(TRIM(name))'), ['CLINIC 1', 'CLINIC 2', 'CLINIC 3', 'ADMISSION'])
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();
        $labId = (int) (DB::table('departments')
            ->whereRaw("UPPER(TRIM(name)) = 'LABORATORY' AND status <> 'inactive'")
            ->value('id') ?? 0);

        $tier = 'r';
        if (preg_match('/^([A-Z]+)-\d+$/', $row->queue_number, $pm) === 1) {
            $tier = strtolower(substr($pm[1], -1));
        }

        if ($tier === 'e') {
            $newCat = 'emergency';
        } elseif ($tier === 'p') {
            $newCat = 'priority';
        } elseif ($sourceDept === $labId && in_array($targetDept, $keepIds, true)) {
            $newCat = 'priority';
        } else {
            $newCat = 'regular';
        }

        DB::table('queue')
            ->where('id', (int) $row->id)
            ->update([
                'department_id' => $targetDept,
                'status' => 'waiting',
                'served_by' => null,
                'category' => $newCat,
            ]);

        $emit->logQueueAction((int) $row->id, (string) $row->queue_number, $sourceDept, $userId, 'transferred_out', $targetDept, 'serving', 'waiting');
        $emit->logQueueAction((int) $row->id, (string) $row->queue_number, $targetDept, $userId, 'transferred_in', $sourceDept, 'waiting', 'waiting');

        $emit->queueUpdated($sourceDept);
        $emit->queueUpdated($targetDept);

        return response()->json([
            'success' => true,
            'queue_code' => (string) $row->queue_number,
            'message' => 'Patient transferred successfully',
        ]);
    }

    public function prioritize(Request $request, EmitService $emit, QueueNumbersService $numbers)
    {
        $userId = (int) Session::get('user_id', 0);
        $currentDept = (int) Session::get('department_id', 0);
        $returnCode = strtoupper(trim((string) ($request->input('code', '') ?: $request->input('queue_number', ''))));

        if (! $currentDept) {
            return response()->json(['success' => false, 'message' => 'No department assigned']);
        }

        $deptRow = DB::table('departments')->select('id', 'name')->where('id', $currentDept)->first();
        if (! $deptRow || stripos((string) $deptRow->name, 'laborat') === false) {
            return response()->json(['success' => false, 'message' => 'Only the LABORATORY department can prioritize queues']);
        }

        if ($returnCode === '') {
            return response()->json(['success' => false, 'message' => 'Return code is required']);
        }

        $queueRow = DB::selectOne(
            'SELECT TOP 1 id, department_id, status, queue_number, category, created_at
             FROM queue WHERE return_code = ? ORDER BY created_at DESC',
            [$returnCode]
        );
        if (! $queueRow) {
            return response()->json(['success' => false, 'message' => 'Return code not found. Check the code printed on the ticket.']);
        }

        $oldDept = (int) $queueRow->department_id;
        $oldStatus = strtolower(trim((string) ($queueRow->status ?? '')));

        if ($oldStatus === 'serving') {
            return response()->json(['success' => false, 'message' => 'That ticket is currently being served and cannot be moved']);
        }
        if (in_array($oldStatus, ['waiting', 'hold'], true) && $oldDept === $currentDept) {
            return response()->json(['success' => false, 'message' => 'That ticket is already waiting in this department']);
        }

        [$regPrefix, $priPrefix, $emerPrefix] = $numbers->queuePrefixes($currentDept);
        $origTier = $numbers->tierForNumber((string) $queueRow->queue_number);

        if ($origTier === 'e') {
            $newCat = 'emergency';
            $numPrefix = $emerPrefix;
        } elseif ($origTier === 'p') {
            $newCat = 'priority';
            $numPrefix = $priPrefix;
        } else {
            $newCat = 'priority';
            $numPrefix = $regPrefix;
        }

        $newNumber = null;
        if (preg_match('/^([A-Z]+)-(\d+)$/', (string) $queueRow->queue_number, $m) === 1) {
            $candidate = (strtoupper($m[1]) === $numPrefix) ? $queueRow->queue_number : $numPrefix.'-'.$m[2];
            $taken = DB::table('queue')
                ->where('department_id', $currentDept)
                ->where('queue_number', $candidate)
                ->whereIn('status', ['waiting', 'serving', 'hold'])
                ->exists();
            if (! $taken) {
                $newNumber = $candidate;
            }
        }
        if ($newNumber === null) {
            try {
                $seq = $numbers->nextDailySequence($currentDept);
            } catch (\Throwable $e) {
                return response()->json(['success' => false, 'message' => 'Failed to prioritize queue']);
            }
            $newNumber = $numPrefix.'-'.str_pad((string) $seq, 3, '0', STR_PAD_LEFT);
        }

        DB::table('queue')
            ->where('id', (int) $queueRow->id)
            ->update([
                'department_id' => $currentDept,
                'queue_number' => $newNumber,
                'status' => 'waiting',
                'served_by' => null,
                'category' => $newCat,
            ]);

        $emit->logQueueAction((int) $queueRow->id, $newNumber, $oldDept, $userId, 'prioritized_out', $currentDept, $oldStatus, 'waiting');
        $emit->logQueueAction((int) $queueRow->id, $newNumber, $currentDept, $userId, 'prioritized_in', $oldDept, 'waiting', 'waiting');

        $emit->queueUpdated($oldDept);
        $emit->queueUpdated($currentDept);

        return response()->json([
            'success' => true,
            'queue_number' => $newNumber,
            'message' => "Returnee re-queued as {$newNumber} ({$newCat})",
        ]);
    }
}
