<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AccountTest extends TestCase
{
    use DatabaseTransactions;

    public function test_update_password_changes_login_credentials(): void
    {
        $this->loginAs('qa_clinic1');

        $this->post('/update_password.php', [
            'old_password' => 'testpass!123',
            'new_password' => 'brandnew!456',
        ])->assertOk()
            ->assertJson(['success' => true]);

        $hash = DB::table('users')->where('user_id', $this->userId('qa_clinic1'))->value('password');
        $this->assertTrue(Hash::check('brandnew!456', (string) $hash));

        $this->post('/logout.php')->assertRedirect();

        $this->post('/login.php', ['username' => 'qa_clinic1', 'password' => 'brandnew!456'])
            ->assertOk();
    }

    public function test_update_password_rejects_wrong_old_password(): void
    {
        $this->loginAs('qa_clinic1');

        $this->post('/update_password.php', [
            'old_password' => 'wrongpass',
            'new_password' => 'brandnew!456',
        ])->assertOk()
            ->assertJson(['success' => false, 'message' => 'Old password is incorrect']);
    }

    public function test_update_password_does_not_trim_password(): void
    {
        $this->loginAs('qa_clinic1');

        $this->post('/update_password.php', [
            'old_password' => 'testpass!123',
            'new_password' => 'spacedpassx ',
        ])->assertOk()->assertJson(['success' => true]);

        $hash = DB::table('users')->where('user_id', $this->userId('qa_clinic1'))->value('password');

        $this->assertFalse(Hash::check('spacedpassx', (string) $hash));
        $this->assertTrue(Hash::check('spacedpassx ', (string) $hash));
    }

    public function test_update_password_rejects_too_short(): void
    {
        $this->loginAs('qa_clinic1');

        $this->post('/update_password.php', [
            'old_password' => 'testpass!123',
            'new_password' => 'abc',
        ])->assertOk()
            ->assertJson(['success' => false, 'message' => 'New password too short']);
    }

    public function test_update_password_requires_old_password_when_not_default(): void
    {
        $this->loginAs('qa_clinic1');

        $this->post('/update_password.php', ['new_password' => 'brandnew!456'])
            ->assertOk()
            ->assertJson(['success' => false, 'message' => 'Missing parameters']);
    }

    public function test_default_password_can_change_without_old_password(): void
    {
        $this->post('/login.php', ['username' => 'qa_superadmin', 'password' => 'testpass!123'])
            ->assertOk();

        // Simulate a default-password session state (as after admin reset).
        session(['default_pw' => true]);

        $this->post('/update_password.php', ['new_password' => 'fresh!pass1'])
            ->assertOk()
            ->assertJson(['success' => true]);
    }

    public function test_edit_account_updates_profile(): void
    {
        $this->loginAs('qa_clinic1');

        $this->post('/edit_account.php', [
            'username' => 'qa_clinic1',
            'firstname' => 'Juan',
            'lastname' => 'Dela Cruz',
            'position' => 'Registrar',
        ])->assertRedirect('/edit_account.php?success=1');

        $row = DB::table('users')->where('user_id', $this->userId('qa_clinic1'))->first();
        $this->assertSame('Juan', $row->firstname);
        $this->assertSame('Dela Cruz', $row->lastname);
        $this->assertSame('Registrar', $row->position);
    }

    public function test_edit_account_requires_login(): void
    {
        $this->get('/edit_account.php')
            ->assertRedirect('/login.php');
    }

    public function test_edit_account_admin_is_redirected_to_index(): void
    {
        $this->loginAs('qa_admin');

        $this->post('/edit_account.php', ['username' => 'qa_admin'])
            ->assertRedirect('/index.php');
    }
}
