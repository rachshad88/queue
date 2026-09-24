<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class SectionedDisplayServeTest extends TestCase
{
    use DatabaseTransactions;

    private function takeoverSession(int $userId, int $sectionId): array
    {
        return [
            'user_id' => $userId,
            'is_superadmin' => true,
            'department_id' => 3,
            'department' => 'ADMISSION',
            'takeover_section_id' => $sectionId,
            'takeover_section_table' => 'admission_sections',
        ];
    }

    private function freeSection(int $sectionId): void
    {
        DB::table('admission_sections')
            ->where('id', $sectionId)
            ->update(['occupied_by' => null, 'status' => 0]);
    }

    public function test_superadmin_takeover_serve_records_window_and_wall_shows_number(): void
    {
        $this->freeSection(1);
        $this->seedQueueRow(3, 'AD-901', 'waiting', 'regular', 60);
        $superId = $this->userId('qa_superadmin');

        $this->loginAs('qa_superadmin');
        $this->withSession($this->takeoverSession($superId, 1))
            ->post('/serve_next.php', ['department_id' => 3])
            ->assertOk()
            ->assertJson(['success' => true, 'queue_number' => 'AD-901']);

        $this->assertSame($superId, (int) DB::table('admission_sections')->where('id', 1)->value('occupied_by'));
        $this->assertSame(1, (int) DB::table('admission_sections')->where('id', 1)->value('status'));

        $serving = $this->get('/get_live_serving.php?ids=3')->assertOk()->json()[0]['serving'];
        $window = collect($serving)->firstWhere('section', 'Admission 1');
        $this->assertNotNull($window);
        $this->assertSame('AD-901', $window['queue_number']);
    }

    public function test_serve_does_not_steal_window_held_by_another_staffer(): void
    {
        DB::table('admission_sections')->where('id', 1)->update(['occupied_by' => 999, 'status' => 1]);
        $this->seedQueueRow(3, 'AD-902', 'waiting', 'regular', 60);
        $superId = $this->userId('qa_superadmin');

        $this->loginAs('qa_superadmin');
        $this->withSession($this->takeoverSession($superId, 1))
            ->post('/serve_next.php', ['department_id' => 3])
            ->assertOk()
            ->assertJson(['success' => true, 'queue_number' => 'AD-902']);

        $this->assertSame(999, (int) DB::table('admission_sections')->where('id', 1)->value('occupied_by'));
    }

    public function test_already_serving_restamps_released_window(): void
    {
        $this->freeSection(1);
        $this->seedQueueRow(3, 'AD-903', 'waiting', 'regular', 60);
        $superId = $this->userId('qa_superadmin');

        $this->loginAs('qa_superadmin');
        $session = $this->takeoverSession($superId, 1);
        $this->withSession($session)
            ->post('/serve_next.php', ['department_id' => 3])
            ->assertOk()
            ->assertJson(['success' => true]);

        // Window released mid-consult (idle sweep / logout) while the row is
        // still being served: the next Serve Next re-records the window.
        $this->freeSection(1);

        $this->withSession($session)
            ->post('/serve_next.php', ['department_id' => 3])
            ->assertOk()
            ->assertJson(['success' => true, 'queue_number' => 'AD-903']);

        $this->assertSame($superId, (int) DB::table('admission_sections')->where('id', 1)->value('occupied_by'));
    }

    public function test_staff_window_serve_still_shows_on_wall(): void
    {
        $this->loginAs('qa_admission');
        $this->post('/assign_section.php', ['section_id' => 1])->assertRedirect('/index.php');
        $this->seedQueueRow(3, 'AD-904', 'waiting', 'regular', 60);

        $this->post('/serve_next.php', ['department_id' => 3])
            ->assertOk()
            ->assertJson(['success' => true, 'queue_number' => 'AD-904']);

        $serving = $this->get('/get_live_serving.php?ids=3')->assertOk()->json()[0]['serving'];
        $window = collect($serving)->firstWhere('section', 'Admission 1');
        $this->assertNotNull($window);
        $this->assertSame('AD-904', $window['queue_number']);
    }

    public function test_queue_action_serve_records_window(): void
    {
        $this->freeSection(2);
        $queueId = $this->seedQueueRow(3, 'AD-905', 'waiting', 'regular', 60);
        $superId = $this->userId('qa_superadmin');

        $this->loginAs('qa_superadmin');
        $this->withSession($this->takeoverSession($superId, 2))
            ->post('/queue_action.php', [
                'queue_id' => $queueId,
                'action' => 'serve',
                'approver_password' => 'testpass!123',
            ])
            ->assertOk()
            ->assertJson(['success' => true, 'queue_number' => 'AD-905']);

        $this->assertSame($superId, (int) DB::table('admission_sections')->where('id', 2)->value('occupied_by'));
    }
}
