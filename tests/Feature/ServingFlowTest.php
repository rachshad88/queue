<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ServingFlowTest extends TestCase
{
    use DatabaseTransactions;

    public function test_serve_next_serves_oldest_waiting(): void
    {
        $this->loginAs('qa_clinic1');
        $this->seedQueueRow(1, 'C1-401', 'waiting', 'regular', 120);
        $this->seedQueueRow(1, 'C1-402', 'waiting', 'regular', 90);

        $this->post('/serve_next.php', ['department_id' => 1])
            ->assertOk()
            ->assertJson(['success' => true, 'queue_number' => 'C1-401']);

        $row = DB::table('queue')->where('queue_number', 'C1-401')->first();
        $this->assertSame('serving', $row->status);
        $this->assertSame($this->userId('qa_clinic1'), (int) $row->served_by);
        $this->assertNotNull($row->served_at);

        $log = DB::table('queue_log')->where('queue_id', $this->queueRowId('C1-401'))->orderByDesc('id')->first();
        $this->assertSame('serving', $log->action);
        $this->assertSame('waiting', $log->old_status);
        $this->assertSame('serving', $log->new_status);
    }

    public function test_finish_completes_serving_row(): void
    {
        $this->loginAs('qa_clinic1');
        $this->seedQueueRow(1, 'C1-403', 'serving', 'regular', 60, $this->userId('qa_clinic1'));

        $this->post('/finish.php', ['department_id' => 1])
            ->assertOk()
            ->assertJson(['success' => true]);

        $row = DB::table('queue')->where('queue_number', 'C1-403')->first();
        $this->assertSame('done', $row->status);
    }

    public function test_serve_next_allowed_during_current_serve_finishes_current_first(): void
    {
        $this->loginAs('qa_clinic1');
        $this->seedQueueRow(1, 'C1-404', 'serving', 'regular', 60, $this->userId('qa_clinic1'));
        $this->seedQueueRow(1, 'C1-405', 'waiting', 'regular', 120);

        // For clinic departments serve_next follows finish-then-serve: the
        // operator's current patient is retired and the next waiting is claimed.
        $this->post('/serve_next.php', ['department_id' => 1])
            ->assertOk()
            ->assertJson(['success' => true, 'queue_number' => 'C1-405']);

        $this->assertSame('done', DB::table('queue')->where('queue_number', 'C1-404')->value('status'));
        $this->assertSame('serving', DB::table('queue')->where('queue_number', 'C1-405')->value('status'));
    }

    public function test_serve_next_prioritizes_category_over_age(): void
    {
        $this->loginAs('qa_clinic1');
        $this->seedQueueRow(1, 'C1-410', 'waiting', 'regular', 120);
        $this->seedQueueRow(1, 'C1-411', 'waiting', 'priority', 90);

        $this->post('/serve_next.php', ['department_id' => 1])
            ->assertOk()
            ->assertJson(['success' => true, 'queue_number' => 'C1-411']);
    }

    public function test_queue_action_hold_and_unhold(): void
    {
        $this->loginAs('qa_clinic1');
        $id = $this->seedQueueRow(1, 'C1-412', 'waiting', 'regular', 120);

        $this->post('/queue_action.php', ['action' => 'hold', 'queue_id' => $id])
            ->assertOk()
            ->assertJson(['success' => true, 'action' => 'hold']);

        $this->assertSame('hold', DB::table('queue')->where('id', $id)->value('status'));

        $this->post('/queue_action.php', ['action' => 'unhold', 'queue_id' => $id])
            ->assertOk()
            ->assertJson(['success' => true, 'action' => 'unhold']);

        $this->assertSame('waiting', DB::table('queue')->where('id', $id)->value('status'));
    }

    public function test_queue_action_remove_retires_ticket(): void
    {
        $this->loginAs('qa_clinic1');
        $id = $this->seedQueueRow(1, 'C1-413', 'waiting', 'regular', 120);
        $this->seedQueueRow(1, 'C1-414', 'waiting', 'regular', 90);

        $this->post('/queue_action.php', ['action' => 'remove', 'queue_id' => $id])
            ->assertOk()
            ->assertJson(['success' => true, 'action' => 'remove']);

        $this->assertSame('done', DB::table('queue')->where('id', $id)->value('status'));
        $this->assertNull(DB::table('queue')->where('id', $id)->value('served_by'));

        $log = DB::table('queue_log')->where('queue_id', $id)->orderByDesc('id')->first();
        $this->assertSame('remove', strtolower((string) $log->action));
        $this->assertSame('done', $log->new_status);
    }

    public function test_queue_action_serve_claims_ticket_with_approval(): void
    {
        $this->loginAs('qa_clinic1');
        $id = $this->seedQueueRow(1, 'C1-415', 'waiting', 'regular', 120);

        $this->post('/queue_action.php', [
            'action' => 'serve',
            'queue_id' => $id,
            'approver_password' => 'testpass!123',
        ])->assertOk()->assertJson(['success' => true, 'action' => 'serve']);

        $row = DB::table('queue')->where('id', $id)->first();
        $this->assertSame('serving', $row->status);
        $this->assertSame($this->userId('qa_clinic1'), (int) $row->served_by);
    }

    public function test_queue_action_serve_requires_approval(): void
    {
        $this->loginAs('qa_clinic1');
        $id = $this->seedQueueRow(1, 'C1-416', 'waiting', 'regular', 120);

        $this->post('/queue_action.php', ['action' => 'serve', 'queue_id' => $id])
            ->assertOk()
            ->assertJson(['success' => false, 'message' => 'Physician/Admin approval required']);

        $this->assertSame('waiting', DB::table('queue')->where('id', $id)->value('status'));
    }

    public function test_queue_action_rejects_unknown_action(): void
    {
        $this->loginAs('qa_clinic1');
        $id = $this->seedQueueRow(1, 'C1-417', 'waiting', 'regular', 120);

        $this->post('/queue_action.php', ['action' => 'absent', 'queue_id' => $id])
            ->assertOk()
            ->assertJson(['success' => false, 'message' => 'Invalid action']);
    }

    public function test_queue_action_requires_queue_id(): void
    {
        $this->loginAs('qa_clinic1');

        $this->post('/queue_action.php', ['action' => 'hold'])
            ->assertOk()
            ->assertJson(['success' => false, 'message' => 'Queue ID is required']);
    }

    public function test_repeat_call_emits_correct_dept(): void
    {
        $this->loginAs('qa_clinic1');
        $this->seedQueueRow(1, 'C1-418', 'serving', 'regular', 60, $this->userId('qa_clinic1'));

        $this->post('/repeat_call.php', [
            'department_id' => 1,
            'queue_number' => 'C1-418',
            'department_name' => 'CLINIC 1',
        ])->assertOk();
    }

    private function queueRowId(string $number): int
    {
        return (int) DB::table('queue')->where('queue_number', $number)->value('id');
    }
}
