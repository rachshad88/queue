<?php

namespace App\Http\Controllers;

use App\Services\EmitService;
use App\Services\QueueNumbersService;
use App\Services\SingleLoginService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Session;

/**
 * Port of app/waiting_queue.php: the public Waiting Area ticket kiosk.
 * Issues tickets for the department whose name contains "Waiting".
 */
class WaitingQueueController extends Controller
{
    public function show(Request $request, SingleLoginService $singleLogin)
    {
        $this->assertKioskIfLoggedIn($request, $singleLogin);

        return view('waiting_queue', [
            'fromAdmission' => $request->query('from') === 'admission',
            'isLoggedIn' => Session::has('user_id') && Session::get('user_id') !== null,
        ]);
    }

    public function issue(Request $request, SingleLoginService $singleLogin, QueueNumbersService $numbers, EmitService $emit)
    {
        $this->assertKioskIfLoggedIn($request, $singleLogin);

        if (! $request->has('take_ticket')) {
            return redirect('waiting_queue.php');
        }

        $dept = DB::selectOne(
            'SELECT TOP 1 id, status FROM departments WHERE LOWER(name) LIKE ? ORDER BY id ASC',
            ['%waiting%']
        );

        if (! $dept) {
            return response("Waiting Area department not found. Please configure a department with 'Waiting' in its name.");
        }
        if (strtolower(trim((string) ($dept->status ?? 'active'))) !== 'active') {
            return response('The Waiting Area department is currently inactive.');
        }

        $deptId = (int) $dept->id;
        $category = in_array((string) $request->input('category'), ['priority', 'emergency'], true)
            ? (string) $request->input('category')
            : 'regular';

        try {
            [$number, $code] = $numbers->issueTicketNumbers($deptId, $category);
        } catch (\Throwable $e) {
            logger()->error('waiting ticket numbering failed: '.$e->getMessage());

            return response('Failed to issue ticket. Please try again.');
        }

        DB::insert(
            'INSERT INTO queue (department_id, queue_number, status, created_at, category, return_code)
             VALUES (?, ?, \'waiting\', '.config('queue.manila_now').', ?, ?)',
            [$deptId, $number, $category, $code]
        );

        $emit->queueUpdated($deptId);

        return redirect(sprintf(
            'ticket_others.php?department_id=%d&queue_number=%s&category=%s&code=%s',
            $deptId,
            urlencode($number),
            urlencode($category),
            urlencode($code)
        ));
    }

    private function assertKioskIfLoggedIn(Request $request, SingleLoginService $singleLogin): void
    {
        $userId = Session::get('user_id');
        if ($userId === null) {
            return;
        }

        if (! $singleLogin->assertSingleLogin($request, (int) $userId, (string) Session::get('usertype', ''))) {
            abort(redirect('logout.php?reason=another_device'));
        }
    }
}
