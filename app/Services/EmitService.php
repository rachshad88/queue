<?php

namespace App\Services;

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

    public function __construct(private readonly Request $request)
    {
        $this->url = 'http://localhost:3000/emit';
        $this->token = (string) (getenv('QS_EMIT_TOKEN') ?: '');
    }

    /**
     * Emit a Socket.IO event to the Node server (native emitEvent()).
     */
    public function emit(string $event, array|string|int $payload): void
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
        $base = $this->request;
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
                'client_ip' => (new SingleLoginService)->clientIp($base) ?: null,
                'created_at' => DB::raw(config('queue.manila_now')),
            ]);

            return true;
        } catch (\Throwable $e) {
            Log::error('queue_log insert failed: '.$e->getMessage());

            return false;
        }
    }
}
