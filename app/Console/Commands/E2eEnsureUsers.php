<?php

namespace App\Console\Commands;

use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Idempotently upserts the fixed E2E accounts used by the Playwright
 * regression suite (tests/e2e). Run it manually, or let Playwright's
 * globalSetup invoke it. This writes to the app's configured database,
 * i.e. the live queue database — the regression suite is therefore gated
 * behind E2E_ALLOW_LIVE=1.
 */
#[Signature('e2e:ensure-users {--password= : Password for every E2E account (default: E2Epass!2026)}')]
#[Description('Upsert the fixed E2E Playwright accounts (idempotent; writes to the live DB).')]
class E2eEnsureUsers extends Command
{
    public function handle(): int
    {
        $password = (string) ($this->option('password') ?? env('E2E_PASSWORD', 'E2Epass!2026'));
        if ($password === '' || $password === '12345') {
            $this->error('Refusing a blank or the default-app password for E2E accounts.');

            return self::FAILURE;
        }

        $departments = DB::table('departments')->pluck('name', 'id');

        $accounts = [
            ['e2e_superadmin', 'superadmin', null, 'Superadmin'],
            ['e2e_admin', 'admin', 3, 'Admin'],
            ['e2e_clinic', 'staff', 1, 'Clinic'],
            ['e2e_admission', 'staff', 3, 'Admission'],
            ['e2e_waiting', 'staff', 15, 'Waiting'],
            ['e2e_abtc', 'staff', 8, 'Abtc'],
        ];

        $hash = Hash::make($password);
        $now = now();

        foreach ($accounts as [$username, $usertype, $departmentId, $lastname]) {
            $deptName = $departmentId !== null && $departments->has($departmentId)
                ? $departments[$departmentId]
                : null;

            $updated = DB::table('users')->where('username', $username)->update([
                'password' => $hash,
                'usertype' => $usertype,
                'department_id' => $departmentId,
                'department' => $deptName,
                'status' => 'active',
                'last_active' => $now,
            ]);

            if ($updated > 0) {
                $this->line("  updated  $username");

                continue;
            }

            DB::table('users')->insert([
                'username' => $username,
                'password' => $hash,
                'usertype' => $usertype,
                'firstname' => 'E2E',
                'lastname' => $lastname,
                'middlename' => null,
                'position' => 'E2E Regression',
                'department' => $deptName,
                'department_id' => $departmentId,
                'status' => 'active',
                'login_token' => null,
                'last_active' => $now,
                'last_login_at' => null,
                'last_ip' => null,
            ]);
            $this->line("  created  $username");
        }

        $this->info('E2E accounts are ready.');

        return self::SUCCESS;
    }
}
