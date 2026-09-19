<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

class ReportsTest extends TestCase
{
    use DatabaseTransactions;

    public function test_served_queues_report_renders_for_staff(): void
    {
        $this->loginAs('qa_clinic1');

        $this->get('/served_queues.php?type=daily')
            ->assertOk();
    }

    public function test_served_queues_monthly_type_renders(): void
    {
        $this->loginAs('qa_clinic1');

        $this->get('/served_queues.php?type=monthly')
            ->assertOk();
    }

    public function test_server_history_renders_filtered_by_department(): void
    {
        $this->loginAs('qa_admin');

        $this->get('/server_history.php?department=1&from=2026-01-01&to=2026-12-31')
            ->assertOk();
    }

    public function test_queue_logs_denied_for_non_superadmin(): void
    {
        $this->loginAs('qa_admin');

        $this->get('/queue_logs.php')
            ->assertRedirect('/index.php');
    }

    public function test_queue_logs_allowed_for_superadmin(): void
    {
        $this->loginAs('qa_superadmin');

        $this->get('/queue_logs.php')
            ->assertOk();
    }
}
