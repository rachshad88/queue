<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class UserManagementTest extends TestCase
{
    use DatabaseTransactions;

    public function test_staff_can_view_only_own_account(): void
    {
        $this->loginAs('qa_clinic1');

        $response = $this->get('/user_management.php')
            ->assertOk();

        $users = $response->viewData('users');
        $this->assertCount(1, $users);
        $this->assertSame($this->userId('qa_clinic1'), (int) $users[0]->user_id);
    }

    public function test_staff_cannot_edit_another_user(): void
    {
        $this->loginAs('qa_clinic1');
        $other = $this->userId('qa_admin');

        $this->post('/user_management.php', ['id' => $other])
            ->assertForbidden();
    }

    public function test_admin_add_user_creates_with_default_password(): void
    {
        $this->loginAs('qa_admin');

        $this->post('/user_management.php', [
            'action' => 'add',
            'username' => 'staff_new',
            'usertype' => 'staff',
            'firstname' => 'New',
            'middlename' => '',
            'lastname' => 'Staff',
            'position' => 'Assistant',
            'department' => 1,
        ])->assertRedirect('/user_management.php?success=1');

        $row = DB::table('users')->where('username', 'staff_new')->first();
        $this->assertNotNull($row);
        $this->assertSame('staff', $row->usertype);
        $this->assertSame(1, (int) $row->department_id);
        $this->assertTrue(Hash::check('12345', (string) $row->password));
    }

    public function test_add_user_requires_admin(): void
    {
        $this->loginAs('qa_clinic1');

        $this->post('/user_management.php', ['action' => 'add', 'username' => 'hacker'])
            ->assertRedirect('/login.php');
    }

    public function test_admin_can_edit_user_status_to_inactive(): void
    {
        $this->loginAs('qa_admin');
        $id = $this->userId('qa_clinic1');

        $this->post('/user_management.php', [
            'id' => $id,
            'username' => 'qa_clinic1',
            'usertype' => 'staff',
            'firstname' => 'Wonder',
            'lastname' => 'Staff',
            'position' => 'Clerk',
            'department' => 1,
            'status' => 'inactive',
        ])->assertRedirect('/user_management.php?edited=1');

        $row = DB::table('users')->where('user_id', $id)->first();
        $this->assertSame('inactive', $row->status);
        $this->assertSame('Wonder', $row->firstname);
    }

    public function test_admin_edit_can_reset_password(): void
    {
        $this->loginAs('qa_admin');
        $id = $this->userId('qa_clinic1');

        $this->post('/user_management.php', [
            'id' => $id,
            'username' => 'qa_clinic1',
            'usertype' => 'staff',
            'firstname' => 'Wonder',
            'lastname' => 'Staff',
            'position' => 'Clerk',
            'department' => 1,
            'status' => 'active',
            'password' => 'reset!pass1',
        ])->assertRedirect('/user_management.php?edited=1');

        $row = DB::table('users')->where('user_id', $id)->first();

        $this->assertTrue(Hash::check('reset!pass1', (string) $row->password));
    }
}
