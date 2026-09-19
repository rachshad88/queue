<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Port of app/served_queues.php: served-queues totals grouped by
 * daily / weekly / monthly periods (status = 'done').
 */
class ServedQueuesController extends Controller
{
    public function show(Request $request)
    {
        $type = (string) $request->query('type', 'daily');
        $data = [];

        if ($type === 'daily') {
            $data = DB::select(
                "SELECT CONVERT(date, created_at) AS period, COUNT(*) AS total
                 FROM queue WHERE status = 'done'
                 GROUP BY CONVERT(date, created_at) ORDER BY period DESC"
            );
        } elseif ($type === 'weekly') {
            $data = DB::select(
                "SELECT DATEADD(week, DATEDIFF(week, 0, created_at), 0) AS week_start,
                        DATEADD(day, 6, DATEADD(week, DATEDIFF(week, 0, created_at), 0)) AS week_end,
                        COUNT(*) AS total
                 FROM queue WHERE status = 'done'
                 GROUP BY DATEADD(week, DATEDIFF(week, 0, created_at), 0)
                 ORDER BY week_start DESC"
            );
        } else {
            $type = 'monthly';
            $data = DB::select(
                "SELECT YEAR(created_at) AS year, MONTH(created_at) AS month, COUNT(*) AS total
                 FROM queue WHERE status = 'done'
                 GROUP BY YEAR(created_at), MONTH(created_at)
                 ORDER BY year DESC, month DESC"
            );
        }

        return view('served_queues', [
            'type' => $type,
            'data' => $data,
        ]);
    }
}
