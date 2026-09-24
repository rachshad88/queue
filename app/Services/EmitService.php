<?php

namespace App\Services;

use App\Events\QueueUpdated;
use App\Events\RepeatCall;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Port of the native app's realtime emit + audit layer (app/emit_event.php).
 * Fail-open: the socket being down must never block PHP.
 */
class EmitService
{
    private string $url;

    private string $token;

    public function __construct(
        private readonly Request $request,
        private readonly SingleLoginService $singleLogin
    ) {
        $this->url = 'http://localhost:3000/emit';
        $this->token = (string) (getenv('QS_EMIT_TOKEN') ?: '');
    }

    /**
     * Emit a Socket.IO event to the Node server (native emitEvent()) and, in
     * parallel, the equivalent Reverb broadcast (migration path). Both are
     * fail-open: realtime must never block PHP.
     */
    public function emit(string $event, array|string|int $payload): void
    {
        $this->emitLegacy($event, $payload);
        $this->emitReverb($event, $payload);
    }

    private function emitLegacy(string $event, array|string|int $payload): void
    {
        $timeout = ['http' => ['timeout' => 1.5, 'ignore_errors' => true]];

        if (is_scalar($payload)) {
            $url = $this->url.'?event='.urlencode($event).'&dept='.urlencode((string) $payload);
            if ($this->token !== '') {
                $url .= '&token='.urlencode($this->token);
            }
            @file_get_contents($url, false, stream_context_create($timeout));

            return;
        }

        if ($this->token !== '') {
            $payload['_token'] = $this->token;
        }

        $context = stream_context_create([
            'http' => [
                'header' => "Content-type: application/json\r\n",
                'method' => 'POST',
                'content' => json_encode(['event' => $event, 'payload' => $payload]),
                'timeout' => 1.5,
                'ignore_errors' => true,
            ],
        ]);

        @file_get_contents($this->url, false, $context);
    }

    /**
     * Reverb parallel path. Only structured dept payloads are broadcast;
     * anything malformed is dropped (message validation happens in the
     * event constructors). Never throws: a down Reverb server must not
     * break the request, exactly like the legacy path.
     */
    private function emitReverb(string $event, array|string|int $payload): void
    {
        if (! is_array($payload) || ! isset($payload['dept'])) {
            return;
        }

        $dept = (int) $payload['dept'];
        if ($dept < 1) {
            return;
        }

        try {
            if ($event === 'repeat-call') {
                broadcast(new RepeatCall(
                    $dept,
                    (string) ($payload['department_name'] ?? ''),
                    (string) ($payload['queue_number'] ?? ''),
                    (int) ($payload['user_id'] ?? 0),
                ));
            } else {
                broadcast(new QueueUpdated(
                    $dept,
                    isset($payload['user_id']) ? (int) $payload['user_id'] : null,
                    isset($payload['section_id']) ? (int) $payload['section_id'] : null,
                    isset($payload['queue_number']) ? (string) $payload['queue_number'] : null,
                    isset($payload['section']) ? (string) $payload['section'] : null,
                ));
            }
        } catch (\Throwable $e) {
            Log::warning('reverb emit failed: '.$e->getMessage());
        }
    }

    public function queueUpdated(int $dept): void
    {
        $this->emit('queue-updated', ['dept' => $dept]);
    }

    /**
     * Serve-next emit carrying the served number + display label so live
     * monitors announce immediately (native serve_next.php emit_queue_update()).
     */
    public function serveUpdate(int $dept, int $userId, ?int $sectionId = null, ?string $queueNumber = null, ?string $label = null): void
    {
        $payload = ['dept' => $dept, 'user_id' => $userId];
        if ($sectionId !== null) {
            $payload['section_id'] = $sectionId;
        }
        if ($queueNumber !== null && $queueNumber !== '') {
            $payload['queue_number'] = (string) $queueNumber;
        }
        if ($label !== null && $label !== '') {
            $payload['section'] = (string) $label;
        }
        $this->emit('queue-updated', $payload);
    }

    /**
     * Insert an action row into the queue_log audit table (native logQueueAction()).
     */
    public function logQueueAction(
        int $queueId,
        string $queueNumber,
        int $departmentId,
        int $userId,
        string $action,
        ?int $oldDepartmentId,
        ?string $oldStatus,
        ?string $newStatus,
    ): bool {
        try {
            DB::table('queue_log')->insert([
                'queue_id' => $queueId,
                'queue_number' => $queueNumber,
                'department_id' => $departmentId,
                'user_id' => $userId,
                'action' => $action,
                'old_department_id' => $oldDepartmentId,
                'old_status' => $oldStatus,
                'new_status' => $newStatus,
                'client_ip' => $this->singleLogin->clientIp($this->request) ?: null,
                'created_at' => DB::raw(config('queue.manila_now')),
            ]);

            return true;
        } catch (\Throwable $e) {
            Log::error('queue_log insert failed: '.$e->getMessage());

            return false;
        }
    }
}
