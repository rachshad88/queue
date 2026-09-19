<?php

namespace App\Http\Controllers;

use Illuminate\Support\Facades\Session;

/**
 * Port of app/take_queue.php: generic ticket issuance is retired (410 Gone).
 */
class TakeQueueController extends Controller
{
    public function show()
    {
        return response(view('take_queue', [
            'isLoggedIn' => Session::has('user_id') && Session::get('user_id') !== null,
        ]), 410);
    }
}
