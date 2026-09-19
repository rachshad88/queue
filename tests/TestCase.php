<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\DB;

abstract class TestCase extends BaseTestCase
{
    /**
     * Log in via the real login flow so the session, single-login token and
     * last-active stamp are all set exactly as a production request would.
     */
    protected function loginAs(string $username, string $password = 'testpass!123'): void
    {
        $this->post('/login.php', ['username' => $username, 'password' => $password])
            ->assertOk();
    }

    /**
     * Insert a queue row directly. created_at is anchored seconds ago so the
     * ordering that serve_next relies on is deterministic.
     */
    protected function seedQueueRow(
        int $departmentId,
        string $queueNumber,
        string $status = 'waiting',
        string $category = 'regular',
        int $secondsAgo = 60,
        ?int $servedBy = null,
    ): int {
        $now = config('queue.manila_now');

        return (int) DB::table('queue')->insertGetId([
            'department_id' => $departmentId,
            'queue_number' => $queueNumber,
            'status' => $status,
            'created_at' => DB::raw("DATEADD(second, -{$secondsAgo}, {$now})"),
            'served_by' => $servedBy,
            'category' => $category,
            'return_code' => null,
        ]);
    }

    protected function userId(string $username): int
    {
        return (int) DB::table('users')
            ->where('username', $username)
            ->value('user_id');
    }
}
