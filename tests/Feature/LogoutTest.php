<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class LogoutTest extends TestCase
{
    use DatabaseTransactions;

    public function test_logout_flushes_session_and_redirects(): void
    {
        $this->loginAs('qa_clinic1');

        $this->post('/logout.php')
            ->assertRedirect('/login.php');

        $this->assertNull(session('user_id'));
    }

    public function test_logout_releases_assigned_section(): void
    {
        $this->loginAs('qa_admission');
        $this->post('/assign_section.php', ['section_id' => 2])->assertRedirect('/index.php');

        $this->assertSame(
            $this->userId('qa_admission'),
            (int) DB::table('admission_sections')->where('id', 2)->value('occupied_by')
        );

        $this->post('/logout.php')->assertRedirect('/login.php');

        $this->assertNull(DB::table('admission_sections')->where('id', 2)->value('occupied_by'));
    }

    public function test_logout_clears_login_token_for_staff(): void
    {
        $this->loginAs('qa_clinic1');
        $token = session('login_token');

        $this->assertNotNull($token);
        $this->assertSame(
            $token,
            DB::table('users')->where('user_id', $this->userId('qa_clinic1'))->value('login_token')
        );

        $this->post('/logout.php')->assertRedirect('/login.php');

        $this->assertNull(
            DB::table('users')->where('user_id', $this->userId('qa_clinic1'))->value('login_token')
        );
    }

    public function test_logout_with_another_device_reason_redirects(): void
    {
        $this->loginAs('qa_clinic1');

        $this->post('/logout.php?reason=another_device')
            ->assertRedirect('/login.php?reason=another_device');
    }
}
