<?php

namespace App\Http\Controllers;

use App\Services\SingleLoginService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Session;

/**
 * Port of app/sound/serve.php + app/sound/voice/check.php.
 *
 * These answers replaced the native exact-match fastcgi blocks in nginx, so
 * the URLs are unchanged and the ported JS (_annSrcs wav fallback, offline
 * voice-clip sanity check) keeps working without modification.
 */
class SoundController extends Controller
{
    /** @var array<string, string> */
    private const SERVABLE = [
        'announcement.wav' => 'audio/wav',
        'announcement.m4a' => 'audio/mp4',
    ];

    public function serve(Request $request)
    {
        $name = basename((string) $request->query('f', ''));
        if (! isset(self::SERVABLE[$name])) {
            return response('', 404);
        }

        $path = public_path('app/sound/'.$name);
        if (! is_file($path)) {
            return response('', 404);
        }

        $body = @file_get_contents($path);
        if ($body === false) {
            return response('', 404);
        }

        return response($body, 200, [
            'Content-Type' => self::SERVABLE[$name],
            'Content-Length' => (string) strlen($body),
            'Cache-Control' => 'public, max-age=86400',
        ]);
    }

    public function voiceCheck(Request $request, SingleLoginService $singleLogin)
    {
        $userId = (int) Session::get('user_id', 0);
        if (! $userId) {
            return response()->json(['ok' => false, 'message' => 'Not logged in'], 401);
        }

        $usertype = (string) Session::get('usertype', '');
        if (! $singleLogin->assertSingleLogin($request, $userId, $usertype)) {
            return response()->json(['ok' => false, 'message' => 'Logged in on another device'], 401);
        }

        $expected = [
            'now_serving', 'please_proceed_to', 'queue_number', 'repeating_call', 'sound_test',
        ];
        foreach (range('A', 'Z') as $c) {
            $expected[] = 'letter_'.$c;
        }
        foreach (range(0, 9) as $d) {
            $expected[] = 'digit_'.$d;
        }
        foreach (['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'] as $w) {
            $expected[] = 'number_'.$w;
        }
        foreach (['admission', 'clinic', 'laboratory', 'pharmacy', 'dental', 'nutrition', 'veterinary', 'abtc', 'tb_dots', 'waiting', 'area'] as $w) {
            $expected[] = 'dept_'.$w;
        }

        $missing = [];
        $present = [];
        foreach ($expected as $slug) {
            $file = public_path('app/sound/voice/'.$slug.'.mp3');
            if (is_file($file) && filesize($file) > 500) {
                $present[] = $slug;
            } else {
                $missing[] = $slug;
            }
        }

        return response()->json([
            'ok' => count($missing) === 0,
            'total' => count($expected),
            'present' => count($present),
            'missing' => $missing,
        ]);
    }
}
