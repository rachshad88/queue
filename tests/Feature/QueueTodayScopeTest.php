<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class QueueTodayScopeTest extends TestCase
{
    use DatabaseTransactions;

    public function test_get_queue_excludes_yesterday_rows(): void
    {
        $this->loginAs('qa_clinic1');
        $this->seedQueueRow(1, 'C1-701', 'waiting', 'regular', 60);
        $this->seedQueueRow(1, 'C1-702', 'waiting', 'regular', 2 * 86400);

        $numbers = $this->get('/get_queue.php?department_id=1')
            ->assertOk()
            ->json('queues');

        $this->assertContains('C1-701', array_column($numbers, 'queue_number'));
        $this->assertNotContains('C1-702', array_column($numbers, 'queue_number'));
    }

    public function test_get_queue_sectioned_excludes_yesterday_rows(): void
    {
        $this->loginAs('qa_admission');
        $this->seedQueueRow(3, 'C3-701', 'waiting', 'regular', 60);
        $this->seedQueueRow(3, 'C3-702', 'waiting', 'regular', 2 * 86400);

        $numbers = $this->get('/get_queue.php?department_id=3')
            ->assertOk()
            ->json('queues');

        $this->assertContains('C3-701', array_column($numbers, 'queue_number'));
        $this->assertNotContains('C3-702', array_column($numbers, 'queue_number'));
    }

    public function test_serve_next_skips_yesterday_rows_when_nothing_waiting_today(): void
    {
        $this->loginAs('qa_clinic1');
        $this->seedQueueRow(1, 'C1-703', 'waiting', 'regular', 2 * 86400);

        $this->post('/serve_next.php', ['department_id' => 1])
            ->assertOk()
            ->assertJson(['success' => false, 'message' => 'No patients waiting.']);

        $this->assertSame('waiting', DB::table('queue')->where('queue_number', 'C1-703')->value('status'));
    }

    public function test_serve_next_serves_today_over_yesterday(): void
    {
        $this->loginAs('qa_clinic1');
        $this->seedQueueRow(1, 'C1-704', 'waiting', 'regular', 2 * 86400);
        $this->seedQueueRow(1, 'C1-705', 'waiting', 'regular', 60);

        $this->post('/serve_next.php', ['department_id' => 1])
            ->assertOk()
            ->assertJson(['success' => true, 'queue_number' => 'C1-705']);

        $this->assertSame('waiting', DB::table('queue')->where('queue_number', 'C1-704')->value('status'));
        $this->assertSame('serving', DB::table('queue')->where('queue_number', 'C1-705')->value('status'));
    }

    public function test_pool_pull_excludes_yesterday_rows(): void
    {
        $this->loginAs('qa_clinic1');
        $this->seedQueueRow(2, 'C2-701', 'waiting', 'regular', 2 * 86400);

        $this->post('/serve_next.php', ['department_id' => 1])
            ->assertOk()
            ->assertJson(['success' => false, 'message' => 'No patients waiting.']);

        $this->assertSame('waiting', DB::table('queue')->where('queue_number', 'C2-701')->value('status'));
    }

    public function test_pool_pull_serves_today_row(): void
    {
        $this->loginAs('qa_clinic1');
        $this->seedQueueRow(2, 'C2-702', 'waiting', 'regular', 2 * 86400);
        $this->seedQueueRow(2, 'C2-703', 'waiting', 'regular', 60);

        $this->post('/serve_next.php', ['department_id' => 1])
            ->assertOk()
            ->assertJson(['success' => true, 'queue_number' => 'C2-703', 'pool' => true]);

        $row = DB::table('queue')->where('queue_number', 'C2-703')->first();
        $this->assertSame(1, (int) $row->department_id);
        $this->assertSame('serving', $row->status);
    }
}
