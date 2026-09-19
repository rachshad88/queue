<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class LoginTest extends TestCase
{
    use DatabaseTransactions;

    public function test_superadmin_lands_on_index(): void
    {
        $this->post('/login.php', ['username' => 'qa_superadmin', 'password' => 'testpass!123'])
            ->assertOk()
            ->assertViewHas('destination', 'index.php');
    }

    public function test_admin_lands_on_index(): void
    {
        $this->loginAs('qa_admin');

        $this->assertSame('admin', session('usertype'));
    }

    public function test_clinic_staff_login_populates_session(): void
    {
        $this->loginAs('qa_clinic1');

        $this->assertSame($this->userId('qa_clinic1'), session('user_id'));
        $this->assertSame(1, session('department_id'));
        $this->assertNotNull(session('login_token'));
    }

    public function test_admission_staff_lands_on_choose_section(): void
    {
        $this->post('/login.php', ['username' => 'qa_admission', 'password' => 'testpass!123'])
            ->assertOk()
            ->assertViewHas('destination', 'choose_section.php');
    }

    public function test_waiting_staff_lands_on_choose_waiting_section(): void
    {
        $this->post('/login.php', ['username' => 'qa_waiting', 'password' => 'testpass!123'])
            ->assertOk()
            ->assertViewHas('destination', 'choose_waiting_section.php');
    }

    public function test_wrong_password_redirects_back_with_error(): void
    {
        $this->post('/login.php', ['username' => 'qa_clinic1', 'password' => 'nope'])
            ->assertRedirect('/login.php')
            ->assertSessionHas('error');

        $this->assertNull(session('user_id'));
    }

    public function test_unknown_username_redirects_back_with_error(): void
    {
        $this->post('/login.php', ['username' => 'ghost', 'password' => 'testpass!123'])
            ->assertRedirect('/login.php')
            ->assertSessionHas('error');
    }

    public function test_inactive_account_is_rejected(): void
    {
        DB::table('users')->where('username', 'qa_clinic1')->update(['status' => 'inactive']);

        $this->post('/login.php', ['username' => 'qa_clinic1', 'password' => 'testpass!123'])
            ->assertRedirect('/login.php')
            ->assertSessionHas('error', 'Your account has been deactivated. Please contact the administrator.');
    }

    public function test_inactive_department_is_rejected(): void
    {
        DB::table('departments')->where('id', 1)->update(['status' => 'inactive']);

        $this->post('/login.php', ['username' => 'qa_clinic1', 'password' => 'testpass!123'])
            ->assertRedirect('/login.php')
            ->assertSessionHas('error', 'Your department has been deactivated. Please contact the administrator.');
    }

    public function test_session_check_reports_logged_in(): void
    {
        $this->loginAs('qa_clinic1');

        $this->getJson('/session_check.php')
            ->assertOk()
            ->assertJson(['ok' => true, 'logged_in' => true, 'reason' => '']);
    }

    public function test_logged_out_session_check_reports_out(): void
    {
        $this->post('/login.php', ['username' => 'qa_clinic1', 'password' => 'testpass!123'])->assertOk();
        $this->post('/logout.php')->assertRedirect('/login.php');

        $this->getJson('/session_check.php')
            ->assertOk()
            ->assertJson(['logged_in' => false]);
    }
}
