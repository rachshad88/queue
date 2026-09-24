<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Port of app/ticket_others.php: the printable ticket page (public).
 * Resolves the queue row by exact return code, else newest of that number.
 */
class TicketOthersController extends Controller
{
    public function show(Request $request)
    {
        $departmentId = (int) $request->query('department_id', 0);
        $queueNumber = (string) $request->query('queue_number', '');
        $code = trim((string) $request->query('code', ''));
        $requestedCategory = (string) $request->query('category', '');
        $category = in_array($requestedCategory, ['priority', 'emergency'], true) ? $requestedCategory : 'regular';

        if (! $departmentId || $queueNumber === '') {
            return response('Missing required parameters.');
        }

        if ($code !== '') {
            $queue = DB::selectOne(
                'SELECT TOP 1 * FROM queue WHERE department_id = ? AND return_code = ? ORDER BY created_at DESC',
                [$departmentId, $code]
            );
        } else {
            $queue = DB::selectOne(
                'SELECT TOP 1 * FROM queue WHERE department_id = ? AND queue_number = ?
                 ORDER BY CASE WHEN status IN (\'waiting\',\'serving\',\'hold\') THEN 0 ELSE 1 END, created_at DESC',
                [$departmentId, $queueNumber]
            );
        }

        if (! $queue) {
            return response('Queue record not found.');
        }

        $departmentName = (string) (DB::table('departments')->where('id', $departmentId)->value('name') ?? '');

        return view('ticket_others', [
            'queueNumber' => (string) $queue->queue_number,
            'departmentName' => trim($departmentName) !== '' ? $departmentName : "Department $departmentId",
            'returnCode' => (string) ($queue->return_code ?? ''),
            'printedAt' => date('Y-m-d h:i:s A'),
        ]);
    }
}
