<?php

namespace Tests\Feature;

use App\Services\QueueNumbersService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class TransferTest extends TestCase
{
    use DatabaseTransactions;

    public function test_transfer_moves_serving_ticket_to_another_department(): void
    {
        $this->loginAs('qa_clinic1');
        $this->seedQueueRow(1, 'C1-501', 'serving', 'regular', 60, $this->userId('qa_clinic1'));

        $this->post('/transfer_queue.php', ['department_id' => 2])
            ->assertOk()
            ->assertJson(['success' => true]);

        $row = DB::table('queue')->where('id', $this->queueRowId('C1-501'))->first();
        $this->assertSame(2, (int) $row->department_id);
        $this->assertSame('waiting', $row->status);

        $target = DB::table('queue')->where('department_id', 2)
            ->where('queue_number', 'C1-501')->first();
        $this->assertNotNull($target);
    }

    public function test_transfer_refuses_same_department(): void
    {
        $this->loginAs('qa_clinic1');
        $this->seedQueueRow(1, 'C1-502', 'serving', 'regular', 60, $this->userId('qa_clinic1'));

        $this->post('/transfer_queue.php', ['department_id' => 1])
            ->assertOk()
            ->assertJson(['success' => false, 'message' => 'Cannot transfer to the same department']);
    }

    public function test_transfer_refuses_inactive_target(): void
    {
        $this->loginAs('qa_clinic1');
        DB::table('departments')->where('id', 2)->update(['status' => 'inactive']);
        $this->seedQueueRow(1, 'C1-503', 'serving', 'regular', 60, $this->userId('qa_clinic1'));

        $this->post('/transfer_queue.php', ['department_id' => 2])
            ->assertOk()
            ->assertJson(['success' => false, 'message' => 'Target department is inactive']);
    }

    public function test_transfer_without_serving_ticket_fails(): void
    {
        $this->loginAs('qa_clinic1');
        $this->seedQueueRow(1, 'C1-504', 'waiting', 'regular', 60);

        $this->post('/transfer_queue.php', ['department_id' => 2])
            ->assertOk()
            ->assertJson(['success' => false, 'message' => 'No patient currently being served']);
    }

    public function test_transfer_writes_queue_log(): void
    {
        $this->loginAs('qa_clinic1');
        $id = $this->seedQueueRow(1, 'C1-505', 'serving', 'regular', 60, $this->userId('qa_clinic1'));

        $this->post('/transfer_queue.php', ['department_id' => 2])->assertOk();

        $logs = DB::table('queue_log')->where('queue_id', $id)->get();
        $actions = $logs->pluck('action')->intersect(['transferred_in', 'transferred_out']);

        $this->assertCount(2, $actions);
        $in = $logs->firstWhere('action', 'transferred_in');
        $this->assertSame(2, (int) $in->department_id);
        $this->assertSame(1, (int) $in->old_department_id);
    }

    public function test_switch_department_swaps_session_department_for_superadmin(): void
    {
        $this->loginAs('qa_superadmin');

        $this->post('/switch_department.php', ['department_id' => 4])
            ->assertOk()
            ->assertJson(['success' => true]);

        $this->assertSame(4, (int) session('department_id'));
        $this->assertSame('CLINIC 3', session('department'));
    }

    public function test_lab_prioritize_issues_random_ticket_number(): void
    {
        DB::table('users')->updateOrInsert(['username' => 'qa_labtech'], [
            'password' => Hash::make('testpass!123'),
            'usertype' => 'staff',
            'firstname' => 'QA',
            'lastname' => 'Lab',
            'middlename' => null,
            'position' => 'QA',
            'department_id' => 5,
            'department' => 'LABORATORY',
            'status' => 'active',
            'login_token' => null,
            'last_active' => null,
            'last_login_at' => null,
            'last_ip' => null,
        ]);
        $this->loginAs('qa_labtech');

        // Occupy the reused-candidate number so issuance must draw randomly.
        $this->seedQueueRow(5, 'R-700', 'waiting', 'regular', 60);
        $returnee = $this->seedQueueRow(1, 'C1-700', 'done', 'regular', 3600);
        DB::table('queue')->where('id', $returnee)->update(['return_code' => 'TST1']);

        $response = $this->post('/prioritize_queue.php', ['code' => 'TST1'])
            ->assertOk()
            ->assertJson(['success' => true]);

        $number = $response->json('queue_number');
        $this->assertMatchesRegularExpression('/^R-\d{3}$/', $number);
        $this->assertNotSame('R-700', $number);

        $row = DB::table('queue')->where('id', $returnee)->first();
        $this->assertSame(5, (int) $row->department_id);
        $this->assertSame('waiting', $row->status);
        $this->assertSame('priority', $row->category);
        $this->assertNotNull($row->transferred_at);
    }

    public function test_lab_prioritize_random_numbers_are_unique(): void
    {
        $numbers = app(QueueNumbersService::class);
        $first = $numbers->randomTicketNumber(5, 'R');
        $this->seedQueueRow(5, $first, 'waiting', 'regular', 60);
        $second = $numbers->randomTicketNumber(5, 'R');

        $this->assertMatchesRegularExpression('/^R-\d{3}$/', $first);
        $this->assertNotSame($first, $second);
    }

    private function queueRowId(string $number): int
    {
        return (int) DB::table('queue')->where('queue_number', $number)->value('id');
    }
}
