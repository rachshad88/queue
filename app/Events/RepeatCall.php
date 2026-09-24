<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use InvalidArgumentException;

/**
 * Reverb broadcast for repeat-call announcements (parallel to the legacy
 * Socket.IO :3000 emit path during migration).
 */
class RepeatCall implements ShouldBroadcastNow
{
    public readonly int $departmentId;

    public readonly string $departmentName;

    public readonly string $queueNumber;

    public readonly int $userId;

    public function __construct(int $departmentId, string $departmentName, string $queueNumber, int $userId)
    {
        if ($departmentId < 1 || $departmentId > 9999) {
            throw new InvalidArgumentException('Invalid department id.');
        }
        if ($queueNumber === '' || strlen($queueNumber) > 20) {
            throw new InvalidArgumentException('Invalid queue number.');
        }
        if (strlen($departmentName) > 100) {
            throw new InvalidArgumentException('Invalid department name.');
        }
        if ($userId < 1) {
            throw new InvalidArgumentException('Invalid user id.');
        }

        $this->departmentId = $departmentId;
        $this->departmentName = $departmentName;
        $this->queueNumber = $queueNumber;
        $this->userId = $userId;
    }

    /**
     * @return array<int, Channel>
     */
    public function broadcastOn(): array
    {
        return [
            new Channel('queue-display'),
            new PrivateChannel('dept.'.$this->departmentId),
        ];
    }

    public function broadcastAs(): string
    {
        return 'repeat-call';
    }

    /**
     * @return array<string, int|string>
     */
    public function broadcastWith(): array
    {
        return [
            'department_id' => $this->departmentId,
            'department_name' => $this->departmentName,
            'queue_number' => $this->queueNumber,
            'user_id' => $this->userId,
        ];
    }
}
