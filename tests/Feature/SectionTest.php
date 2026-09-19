<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class SectionTest extends TestCase
{
    use DatabaseTransactions;

    public function test_choose_section_renders_picker_for_admission(): void
    {
        $this->loginAs('qa_admission');

        $this->get('/choose_section.php')
            ->assertOk();
    }

    public function test_assign_section_claims_free_window(): void
    {
        $this->loginAs('qa_admission');

        $this->post('/assign_section.php', ['section_id' => 1])
            ->assertRedirect('/index.php');

        $this->assertSame(
            $this->userId('qa_admission'),
            (int) DB::table('admission_sections')->where('id', 1)->value('occupied_by')
        );
        $this->assertSame(1, (int) DB::table('admission_sections')->where('id', 1)->value('status'));
        $this->assertSame('Admission 1', session('served_by'));
    }

    public function test_assign_waiting_section_claims_window(): void
    {
        $this->loginAs('qa_waiting');

        $this->post('/assign_waiting_section.php', ['section_id' => 2])
            ->assertRedirect('/index.php');

        $this->assertSame(
            $this->userId('qa_waiting'),
            (int) DB::table('waiting_sections')->where('id', 2)->value('occupied_by')
        );
    }

    public function test_assign_section_rejects_taken_window(): void
    {
        $this->loginAs('qa_admission');
        DB::table('admission_sections')->where('id', 1)->update(['occupied_by' => 999, 'status' => 1]);

        $response = $this->post('/assign_section.php', ['section_id' => 1]);

        $response->assertOk();
        $this->assertStringContainsString('already taken', $response->getContent());
        $this->assertSame(999, (int) DB::table('admission_sections')->where('id', 1)->value('occupied_by'));
    }

    public function test_assign_section_override_takes_over_occupied_window(): void
    {
        $this->loginAs('qa_admission');
        DB::table('admission_sections')->where('id', 1)->update(['occupied_by' => 999, 'status' => 1]);

        $this->post('/assign_section.php', ['section_id' => 1, 'override' => 1])
            ->assertRedirect('/index.php');

        $this->assertSame(
            $this->userId('qa_admission'),
            (int) DB::table('admission_sections')->where('id', 1)->value('occupied_by')
        );
    }

    public function test_assign_section_override_denied_outside_dept(): void
    {
        $this->loginAs('qa_clinic1');

        $this->post('/assign_section.php', ['section_id' => 1, 'override' => 1])
            ->assertStatus(400);
    }

    public function test_assign_moves_user_to_new_window(): void
    {
        $this->loginAs('qa_admission');
        $this->post('/assign_section.php', ['section_id' => 1])->assertRedirect('/index.php');

        $this->post('/assign_section.php', ['section_id' => 2])->assertRedirect('/index.php');

        $userId = $this->userId('qa_admission');
        $this->assertNull(DB::table('admission_sections')->where('id', 1)->value('occupied_by'));
        $this->assertSame($userId, (int) DB::table('admission_sections')->where('id', 2)->value('occupied_by'));
    }

    public function test_release_section_requires_superadmin(): void
    {
        $this->loginAs('qa_admission');
        $this->post('/assign_section.php', ['section_id' => 3])->assertRedirect('/index.php');

        $this->post('/release_section.php', ['type' => 'admission', 'section_id' => 3])
            ->assertOk()
            ->assertJson(['success' => false, 'message' => 'Access denied']);
    }

    public function test_superadmin_can_release_occupied_section(): void
    {
        $this->loginAs('qa_admission');
        $this->post('/assign_section.php', ['section_id' => 2])->assertRedirect('/index.php');

        $this->loginAs('qa_superadmin');

        $this->post('/release_section.php', ['type' => 'admission', 'section_id' => 2])
            ->assertOk()
            ->assertJson(['success' => true]);

        $this->assertNull(DB::table('admission_sections')->where('id', 2)->value('occupied_by'));
        $this->assertSame(0, (int) DB::table('admission_sections')->where('id', 2)->value('status'));
    }

    public function test_serve_next_requires_section_for_admission_dept(): void
    {
        $this->loginAs('qa_admission');
        $this->seedQueueRow(3, 'AD-601', 'waiting', 'regular', 60);

        $this->post('/serve_next.php', ['department_id' => 3])
            ->assertOk()
            ->assertJson(['success' => false, 'message' => 'Not assigned to admission section.']);
    }

    public function test_section_control_requires_auth(): void
    {
        $this->get('/section_control.php')
            ->assertRedirect('/login.php');
    }
}
