<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Local/dev/test login accounts only. NEVER run this against the live database —
 * it is seeded implicitly by `migrate:fresh` on the scratch rhu_queue_test DB
 * and by the feature-test suite. Account types mirror real clinic roles.
 */
class TestUserSeeder extends Seeder
{
    public function run(): void
    {
        $users = [
            ['username' => 'qa_superadmin', 'usertype' => 'superadmin', 'department_id' => null, 'department' => null, 'firstname' => 'QA', 'lastname' => 'Superadmin'],
            ['username' => 'qa_admin', 'usertype' => 'admin', 'department_id' => 3, 'department' => 'ADMISSION', 'firstname' => 'QA', 'lastname' => 'Admin'],
            ['username' => 'qa_clinic1', 'usertype' => 'staff', 'department_id' => 1, 'department' => 'CLINIC 1', 'firstname' => 'QA', 'lastname' => 'Clinic1'],
            ['username' => 'qa_admission', 'usertype' => 'staff', 'department_id' => 3, 'department' => 'ADMISSION', 'firstname' => 'QA', 'lastname' => 'Admission'],
            ['username' => 'qa_waiting', 'usertype' => 'staff', 'department_id' => 15, 'department' => 'WAITING AREA', 'firstname' => 'QA', 'lastname' => 'Waiting'],
            ['username' => 'qa_abtc', 'usertype' => 'staff', 'department_id' => 8, 'department' => 'ABTC', 'firstname' => 'QA', 'lastname' => 'Abtc'],
        ];

        foreach ($users as $user) {
            DB::table('users')->updateOrInsert(
                ['username' => $user['username']],
                array_merge($user, [
                    'password' => Hash::make('testpass!123'),
                    'middlename' => null,
                    'position' => 'QA',
                    'status' => 'active',
                    'login_token' => null,
                    'last_active' => null,
                    'last_login_at' => null,
                    'last_ip' => null,
                ]),
            );
        }
    }
}
