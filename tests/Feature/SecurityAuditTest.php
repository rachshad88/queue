<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class SecurityAuditTest extends TestCase
{
    use DatabaseTransactions;

    public function test_hold_denied_for_another_operators_serving_row(): void
    {
        $this->loginAs('qa_clinic1');
        $other = $this->userId('qa_admission');
        $id = $this->seedQueueRow(1, 'C1-901', 'serving', 'regular', 60, $other);

        $this->post('/queue_action.php', ['action' => 'hold', 'queue_id' => $id])
            ->assertOk()
            ->assertJson(['success' => false, 'message' => 'Only the serving operator can hold this queue']);

        $this->assertSame('serving', DB::table('queue')->where('id', $id)->value('status'));
    }

    public function test_hold_allowed_for_own_serving_row(): void
    {
        $this->loginAs('qa_clinic1');
        $me = $this->userId('qa_clinic1');
        $id = $this->seedQueueRow(1, 'C1-902', 'serving', 'regular', 60, $me);

        $this->post('/queue_action.php', ['action' => 'hold', 'queue_id' => $id])
            ->assertOk()
            ->assertJson(['success' => true]);

        $this->assertSame('hold', DB::table('queue')->where('id', $id)->value('status'));
    }

    public function test_serve_denied_without_section_window(): void
    {
        $this->loginAs('qa_waiting');
        $id = $this->seedQueueRow(15, 'R-901', 'waiting', 'regular', 60);

        $this->post('/queue_action.php', [
            'action' => 'serve',
            'queue_id' => $id,
            'approver_password' => 'testpass!123',
        ])
            ->assertOk()
            ->assertJson(['success' => false, 'message' => 'Not assigned to a section.']);

        $this->assertSame('waiting', DB::table('queue')->where('id', $id)->value('status'));
    }

    public function test_repeat_call_denied_for_unserved_number(): void
    {
        $this->loginAs('qa_clinic1');

        $this->post('/repeat_call.php', [
            'department_id' => 1,
            'queue_number' => 'C1-999',
            'department_name' => 'CLINIC 1',
        ])
            ->assertOk()
            ->assertJson(['success' => false, 'message' => 'Only the serving operator can repeat this call.']);
    }

    public function test_chooser_redirects_for_other_department(): void
    {
        $this->loginAs('qa_clinic1');

        $this->get('/choose_section.php')->assertRedirect('/index.php');
        $this->get('/choose_waiting_section.php')->assertRedirect('/index.php');
    }

    public function test_section_control_redirects_for_non_superadmin(): void
    {
        $this->loginAs('qa_clinic1');

        $this->get('/section_control.php')->assertRedirect('/index.php');
    }

    public function test_finish_with_nothing_serving_reports_failure(): void
    {
        $this->loginAs('qa_clinic1');

        $this->post('/finish.php', ['department_id' => 1])
            ->assertOk()
            ->assertJson(['success' => false, 'message' => 'Nothing is currently being served.']);
    }

    public function test_admin_cannot_add_duplicate_username(): void
    {
        $this->loginAs('qa_admin');

        $this->post('/user_management.php', [
            'action' => 'add',
            'username' => 'QA_CLINIC1',
            'usertype' => 'staff',
            'firstname' => 'Dup',
            'lastname' => 'User',
            'position' => 'Clerk',
            'department' => 1,
        ])->assertRedirect('/user_management.php?error=duplicate');

        $this->assertSame(1, DB::table('users')->whereRaw('LOWER(username) = ?', ['qa_clinic1'])->count());
    }

    public function test_admin_cannot_rename_user_to_existing_username(): void
    {
        $this->loginAs('qa_admin');
        $id = $this->userId('qa_waiting');

        $this->post('/user_management.php', [
            'id' => $id,
            'username' => 'qa_clinic1',
            'usertype' => 'staff',
            'firstname' => 'QA',
            'lastname' => 'Waiting',
            'position' => 'QA',
            'department' => 15,
            'status' => 'active',
        ])->assertRedirect('/user_management.php?error=duplicate');
    }

    public function test_get_queue_reports_transferred_at(): void
    {
        $this->loginAs('qa_clinic1');
        $me = $this->userId('qa_clinic1');
        $this->seedQueueRow(1, 'C1-950', 'serving', 'regular', 120, $me);

        $this->post('/transfer_queue.php', ['department_id' => 2])
            ->assertOk()
            ->assertJson(['success' => true]);

        $plainId = $this->seedQueueRow(2, 'C2-950', 'waiting', 'regular', 60);

        $this->loginAs('qa_superadmin');
        $queues = collect($this->get('/get_queue.php?department_id=2')->assertOk()->json('queues'))
            ->keyBy('id');

        $movedId = (int) DB::table('queue')->where('queue_number', 'C1-950')->value('id');
        $this->assertNotNull($queues[$movedId]['transferred_at'] ?? null);
        $this->assertNull($queues[$plainId]['transferred_at'] ?? null);

        // The stamp lives on the ticket row itself, independent of the audit log.
        $this->assertNotNull(DB::table('queue')->where('id', $movedId)->value('transferred_at'));
        $this->assertNull(DB::table('queue')->where('id', $plainId)->value('transferred_at'));
    }
}
