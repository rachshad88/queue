<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use InvalidArgumentException;

/**
 * Reverb broadcast for queue state changes (parallel to the legacy
 * Socket.IO :3000 emit path during migration).
 *
 * Public `queue-display` channel feeds anonymous display walls; the private
 * `dept.{id}` channel feeds authenticated operators of that department.
 */
class QueueUpdated implements ShouldBroadcastNow
{
    public readonly int $dept;

    public readonly ?int $userId;

    public readonly ?int $sectionId;

    public readonly ?string $queueNumber;

    public readonly ?string $label;

    public function __construct(int $dept, ?int $userId = null, ?int $sectionId = null, ?string $queueNumber = null, ?string $label = null)
    {
        if ($dept < 1 || $dept > 9999) {
            throw new InvalidArgumentException('Invalid department id.');
        }
        if ($queueNumber !== null && ($queueNumber === '' || strlen($queueNumber) > 20)) {
            throw new InvalidArgumentException('Invalid queue number.');
        }
        if ($label !== null && strlen($label) > 100) {
            throw new InvalidArgumentException('Invalid label.');
        }
        if ($userId !== null && $userId < 1) {
            throw new InvalidArgumentException('Invalid user id.');
        }
        if ($sectionId !== null && $sectionId < 1) {
            throw new InvalidArgumentException('Invalid section id.');
        }

        $this->dept = $dept;
        $this->userId = $userId;
        $this->sectionId = $sectionId;
        $this->queueNumber = $queueNumber;
        $this->label = $label;
    }

    /**
     * @return array<int, Channel>
     */
    public function broadcastOn(): array
    {
        return [
            new Channel('queue-display'),
            new PrivateChannel('dept.'.$this->dept),
        ];
    }

    public function broadcastAs(): string
    {
        return 'queue-updated';
    }

    /**
     * @return array<string, int|string>
     */
    public function broadcastWith(): array
    {
        $payload = ['dept' => $this->dept];
        if ($this->userId !== null) {
            $payload['user_id'] = $this->userId;
        }
        if ($this->sectionId !== null) {
            $payload['section_id'] = $this->sectionId;
        }
        if ($this->queueNumber !== null && $this->queueNumber !== '') {
            $payload['queue_number'] = $this->queueNumber;
        }
        if ($this->label !== null && $this->label !== '') {
            $payload['section'] = $this->label;
        }

        return $payload;
    }
}
