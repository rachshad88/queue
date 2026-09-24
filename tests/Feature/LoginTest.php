<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Cache;
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
            ->assertSessionHas('error', 'Invalid username or password.');
    }

    public function test_inactive_department_is_rejected(): void
    {
        DB::table('departments')->where('id', 1)->update(['status' => 'inactive']);

        $this->post('/login.php', ['username' => 'qa_clinic1', 'password' => 'testpass!123'])
            ->assertRedirect('/login.php')
            ->assertSessionHas('error', 'Invalid username or password.');
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

    public function test_login_is_throttled_after_ten_attempts(): void
    {
        // Attempts 1–5: rejected with the generic message; the 5th sets the
        // 15-minute lockout for this ip|username pair.
        for ($i = 0; $i < 5; $i++) {
            $this->post('/login.php', ['username' => 'qa_clinic1', 'password' => 'wrong'])
                ->assertRedirect('/login.php')
                ->assertSessionHas('error', 'Invalid username or password.');
        }

        // Attempts 6–10: block hits the cache lockout (correct password would
        // also be rejected) before the window limiter.
        for ($i = 5; $i < 10; $i++) {
            $this->post('/login.php', ['username' => 'qa_clinic1', 'password' => 'wrong'])
                ->assertRedirect('/login.php')
                ->assertSessionHas('error', 'Too many login attempts. Please try again in 15 minutes.');
        }

        // 11th request: the 10 r/m window is exhausted -> 429.
        $this->post('/login.php', ['username' => 'qa_clinic1', 'password' => 'wrong'])
            ->assertStatus(429)
            ->assertSessionHas('error', 'Too many login attempts. Please try again later.');
    }

    public function test_login_lockout_blocks_even_a_correct_password(): void
    {
        Cache::put('login:lock:127.0.0.1|qa_clinic1', time(), now()->addMinutes(15));

        $this->post('/login.php', ['username' => 'qa_clinic1', 'password' => 'testpass!123'])
            ->assertRedirect('/login.php')
            ->assertSessionHas('error', 'Too many login attempts. Please try again in 15 minutes.');
    }

    public function test_login_lockout_is_cleared_after_success(): void
    {
        Cache::put('login:attempts:127.0.0.1|qa_clinic1', 4, now()->addMinutes(15));

        $this->post('/login.php', ['username' => 'qa_clinic1', 'password' => 'testpass!123'])
            ->assertOk();

        $this->assertNull(Cache::get('login:attempts:127.0.0.1|qa_clinic1'));
        $this->assertNull(Cache::get('login:lock:127.0.0.1|qa_clinic1'));
    }
}
