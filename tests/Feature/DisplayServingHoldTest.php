<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class DisplayServingHoldTest extends TestCase
{
    use DatabaseTransactions;

    private int $deptId;

    protected function setUp(): void
    {
        parent::setUp();

        $this->deptId = (int) DB::table('departments')->insertGetId([
            'name' => 'HOLD SCOPE TEST',
            'server' => 'Hold Scope Test',
            'status' => 'active',
        ]);
    }

    private function seedQueue(string $number, string $status, string $category = 'regular', int $secondsAgo = 60, bool $served = false): void
    {
        $now = config('queue.manila_now');

        DB::table('queue')->insert([
            'department_id' => $this->deptId,
            'queue_number' => $number,
            'status' => $status,
            'category' => $category,
            'created_at' => DB::raw("DATEADD(second, -{$secondsAgo}, {$now})"),
            'served_at' => $served ? DB::raw("DATEADD(second, -{$secondsAgo}, {$now})") : null,
        ]);
    }

    public function test_live_serving_excludes_held_rows_from_waiting(): void
    {
        $this->seedQueue('T-101', 'waiting');
        $this->seedQueue('T-102', 'hold');

        $response = $this->get("/get_live_serving.php?ids={$this->deptId}")->assertOk();

        $waiting = $response->json()[0]['waiting'];
        $numbers = array_column($waiting, 'queue_number');

        $this->assertContains('T-101', $numbers);
        $this->assertNotContains('T-102', $numbers);
    }

    public function test_hold_rows_stay_outside_the_serving_payload(): void
    {
        $this->seedQueue('T-201', 'hold');
        $this->seedQueue('T-202', 'serving', 'priority', 60, true);

        $response = $this->get("/get_live_serving.php?ids={$this->deptId}")->assertOk();

        $serving = $response->json()[0]['serving'];
        $waiting = $response->json()[0]['waiting'];
        $servingNumbers = array_column($serving, 'queue_number');
        $waitingNumbers = array_column($waiting, 'queue_number');

        $this->assertContains('T-202', $servingNumbers);
        $this->assertNotContains('T-201', $waitingNumbers);
        $this->assertNotContains('T-201', $servingNumbers);
    }

    public function test_waiting_payload_orders_after_category_then_created_at(): void
    {
        $this->seedQueue('T-303', 'waiting', 'regular', 120);
        $this->seedQueue('T-302', 'waiting', 'priority', 90);

        $response = $this->get("/get_live_serving.php?ids={$this->deptId}")->assertOk();

        $waiting = $response->json()[0]['waiting'];

        $this->assertSame(
            ['T-302', 'T-303'],
            array_column($waiting, 'queue_number')
        );
    }
}
