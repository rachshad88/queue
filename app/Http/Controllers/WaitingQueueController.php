<?php

namespace App\Http\Controllers;

use App\Services\EmitService;
use App\Services\QueueNumbersService;
use App\Services\SingleLoginService;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
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
            logger()->error('waiting ticket issue failed: no active Waiting department found');

            return $this->kioskError(
                "Waiting Area department not found. Please configure a department with 'Waiting' in its name.",
                500
            );
        }
        if (strtolower(trim((string) ($dept->status ?? 'active'))) !== 'active') {
            logger()->warning('waiting ticket issue refused: Waiting department inactive', ['department_id' => (int) $dept->id]);

            return $this->kioskError('The Waiting Area department is currently inactive.', 503);
        }

        $deptId = (int) $dept->id;
        $category = in_array((string) $request->input('category'), ['priority', 'emergency'], true)
            ? (string) $request->input('category')
            : 'regular';

        try {
            [$number, $code] = $numbers->issueTicketNumbers($deptId, $category);
        } catch (\Throwable $e) {
            logger()->error('waiting ticket numbering failed: '.$e->getMessage(), ['department_id' => $deptId]);

            return $this->kioskError('Failed to issue ticket. Please try again.', 500);
        }

        DB::insert(
            'INSERT INTO queue (department_id, queue_number, status, created_at, category, return_code)
             VALUES (?, ?, \'waiting\', '.config('queue.manila_now').', ?, ?)',
            [$deptId, $number, $category, $code]
        );

        logger()->info('waiting ticket issued', [
            'department_id' => $deptId,
            'queue_number' => $number,
            'category' => $category,
        ]);

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

    /**
     * Kiosk-visible failure page (with a proper status code, not a bare 200):
     * plain-text bodies get mistaken for "nothing happened" from a kiosk, and
     * an HTTP status is greppable in access logs where bodies are not.
     */
    private function kioskError(string $message, int $status): Response
    {
        return response(
            '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">'
            .'<meta name="viewport" content="width=device-width, initial-scale=1.0">'
            .'<title>Ticket unavailable</title></head>'
            .'<body style="font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;'
            .'display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0">'
            .'<main style="max-width:28rem;margin:1rem;padding:2rem;background:#fff;'
            .'border:1px solid #fecaca;border-radius:1rem;text-align:center">'
            .'<p style="font-size:1.125rem;font-weight:700;color:#b91c1c;margin:0 0 .5rem">Ticket unavailable</p>'
            .'<p style="margin:0 0 1rem">'.e($message).'</p>'
            .'<a href="waiting_queue.php" style="display:inline-block;padding:.625rem 1.5rem;'
            .'background:#0d9488;color:#fff;font-weight:700;border-radius:.75rem;text-decoration:none">'
            .'Back to kiosk</a></main></body></html>',
            $status,
            ['Content-Type' => 'text/html; charset=UTF-8']
        );
    }
}
