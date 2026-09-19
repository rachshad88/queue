<?php

namespace App\Http\Controllers;

use App\Services\PoolService;
use App\Services\StationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Session;

/**
 * Port of app/get_pool_waiting.php + app/serve_pool.php: the cross-clinic
 * mutual-help panel (Clinic 1/2/3 pool) and pulling a patient from it.
 */
class PoolController extends Controller
{
    public function getWaiting(PoolService $pool)
    {
        $myDept = (int) Session::get('department_id', 0);

        if (! $pool->isPooledDept($myDept)) {
            return response()->json(['success' => false, 'message' => 'Not a pooled clinic department.', 'pool' => []]);
        }

        $byDept = [];
        foreach ($pool->pooledWaitingRows($myDept) as $r) {
            $dep = (int) $r->department_id;
            if (! isset($byDept[$dep])) {
                $byDept[$dep] = ['id' => $dep, 'name' => (string) $r->department_name, 'rows' => []];
            }
            $byDept[$dep]['rows'][] = [
                'id' => (int) $r->id,
                'queue_number' => (string) $r->queue_number,
                'category' => (string) ($r->category ?? 'regular'),
            ];
        }

        return response()->json([
            'success' => true,
            'mine_free' => $pool->ownWaitingCount($myDept) === 0,
            'pool' => array_values($byDept),
        ]);
    }

    public function serve(Request $request, PoolService $pool, StationService $stations)
    {
        $userId = (int) Session::get('user_id', 0);
        $myDept = (int) Session::get('department_id', 0);
        $otherDept = (int) $request->input('department_id', 0);
        $queueId = (int) $request->input('queue_id', 0);
        $password = (string) $request->input('password', '');

        if (! $pool->isPooledDept($myDept)) {
            return response()->json(['success' => false, 'message' => 'Access denied for this department']);
        }

        if (! $otherDept || ! $queueId) {
            return response()->json(['success' => false, 'message' => 'Invalid request']);
        }

        if ($otherDept === $myDept) {
            return response()->json(['success' => false, 'message' => 'Cannot pull from your own department']);
        }

        if (! $pool->isPooledDept($otherDept)) {
            return response()->json(['success' => false, 'message' => 'That department is not part of the clinic pool']);
        }

        $otherStatus = DB::table('departments')->where('id', $otherDept)->value('status');
        if ($otherStatus === null
            || (is_string($otherStatus) && strtolower(trim($otherStatus)) === 'inactive')) {
            return response()->json(['success' => false, 'message' => 'Source clinic is inactive']);
        }

        if ($password === '') {
            return response()->json(['success' => false, 'message' => 'Password required to pull a patient.']);
        }

        $hash = DB::table('users')->where('user_id', $userId)->value('password');
        if ($hash === null || ! password_verify($password, (string) $hash)) {
            return response()->json(['success' => false, 'message' => 'Invalid password.']);
        }

        DB::beginTransaction();
        if (! $pool->acquireOperatorServeLock($userId)) {
            DB::rollBack();

            return response()->json(['success' => false, 'message' => 'Another serve is already in progress.']);
        }

        $label = null;
        $section = $stations->operatorSection($userId, $myDept);
        if ($section) {
            $label = (string) $section->section_name;
        }

        $claimed = $pool->claimAndServe($myDept, $otherDept, $queueId, $userId, $label);

        if (! $claimed) {
            DB::rollBack();

            return response()->json(['success' => false, 'message' => 'Someone already took this patient, or it is no longer waiting.']);
        }

        DB::commit();

        return response()->json([
            'success' => true,
            'queue_number' => (string) $claimed['queue_number'],
            'message' => 'Now serving '.$claimed['queue_number'].' (pulled from another clinic)',
        ]);
    }
}
