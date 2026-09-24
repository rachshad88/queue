<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Carbon;
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

    public function test_server_history_defaults_to_today(): void
    {
        $this->loginAs('qa_admin');
        $today = Carbon::now('+08:00')->toDateString();
        $servedBy = $this->userId('qa_admin');
        $this->seedQueueRow(1, 'R-801', 'done', 'regular', 30, $servedBy);
        $this->seedQueueRow(1, 'R-890', 'done', 'regular', 100000, $servedBy);

        $response = $this->get('/server_history.php');

        $response->assertOk();
        $response->assertSee('R-801', false);
        $response->assertDontSee('R-890', false);
        $response->assertSee('value="'.$today.'"', false);
        $response->assertSee('1 active', false);
        $response->assertSee('Dates: '.$today.' → '.$today, false);
    }

    public function test_server_history_explicit_range_overrides_today_default(): void
    {
        $this->loginAs('qa_admin');
        $servedBy = $this->userId('qa_admin');
        $this->seedQueueRow(1, 'R-890', 'done', 'regular', 100000, $servedBy);

        $this->get('/server_history.php?from=2020-01-01&to=2026-12-31')
            ->assertOk()
            ->assertSee('R-890', false);
    }

    public function test_server_history_sort_params_are_accepted(): void
    {
        $this->loginAs('qa_admin');

        $this->get('/server_history.php?sort=server&dir=asc')
            ->assertOk();
        $this->get('/server_history.php?sort=datetime&dir=desc')
            ->assertOk();
    }

    public function test_server_history_invalid_sort_key_is_ignored(): void
    {
        $this->loginAs('qa_admin');

        $this->get('/server_history.php?sort=created_at;DROP')
            ->assertOk();
    }

    public function test_server_history_export_csv_downloads_filtered_rows(): void
    {
        $this->loginAs('qa_admin');

        $response = $this->get('/server_history.php?from=2026-01-01&to=2026-12-31&export=csv');

        $response->assertOk();
        $response->assertHeader('Content-Type', 'text/csv; charset=utf-8');
        $this->assertStringContainsString('.csv', (string) $response->headers->get('Content-Disposition'));
        $this->assertStringContainsString('Queue #', (string) $response->streamedContent());
    }

    public function test_server_history_export_csv_page_scope(): void
    {
        $this->loginAs('qa_admin');

        $this->get('/server_history.php?export=csv&scope=page&page=2')
            ->assertOk()
            ->assertHeader('Content-Type', 'text/csv; charset=utf-8');
    }

    public function test_server_history_export_selected_downloads_checked_rows(): void
    {
        $this->loginAs('qa_admin');

        $servedBy = $this->userId('qa_admin');
        $id1 = $this->seedQueueRow(1, 'R-901', 'done', 'regular', 60, $servedBy);
        $id2 = $this->seedQueueRow(1, 'P-902', 'done', 'priority', 30, $servedBy);

        $body = (string) $this->get('/server_history.php?export=csv&scope=selected&ids='.$id1.',junk,'.$id2)
            ->assertOk()
            ->assertHeader('Content-Type', 'text/csv; charset=utf-8')
            ->streamedContent();

        $this->assertStringContainsString('R-901', $body);
        $this->assertStringContainsString('P-902', $body);
        $this->assertSame(3, substr_count($body, "\n"));
    }

    public function test_server_history_export_selected_garbage_ids_returns_headers_only(): void
    {
        $this->loginAs('qa_admin');

        $body = (string) $this->get('/server_history.php?export=csv&scope=selected&ids=abc,0,-5,,')
            ->assertOk()
            ->streamedContent();

        $this->assertSame(1, substr_count($body, "\n"));
    }

    public function test_server_history_active_filter_chips(): void
    {
        $this->loginAs('qa_admin');

        $response = $this->get('/server_history.php?department=1&q=R-0');

        $response->assertOk();
        $response->assertSee('<ul class="sh-chips"', false);
        $response->assertSee('3 active', false);
        $response->assertSee('Remove filter Department:', false);
        $response->assertSee('Remove filter Queue #:', false);
        $response->assertSee('href="server_history.php?q=R-0"', false);
    }

    public function test_server_history_empty_state_colspan(): void
    {
        $this->loginAs('qa_admin');

        $response = $this->get('/server_history.php?q=ZZZ-NO-MATCH-999');

        $response->assertOk();
        $response->assertSee('colspan="8"', false);
        $response->assertSee('No serve records found for the current filters.', false);
        $response->assertSee('Clear filters', false);
        $response->assertSee('href="server_history.php"', false);
    }

    public function test_server_history_sort_header_aria_exposed(): void
    {
        $this->loginAs('qa_admin');

        $servedBy = $this->userId('qa_admin');
        $this->seedQueueRow(1, 'R-905', 'done', 'regular', 60, $servedBy);

        $response = $this->get('/server_history.php?sort=datetime&dir=desc');

        $response->assertOk();
        $response->assertSee('aria-sort="descending"', false);
        $response->assertSee('role="rowheader"', false);
        $response->assertDontSee('aria-sort="ascending"', false);
    }

    public function test_server_history_dashboard_markup(): void
    {
        $this->loginAs('qa_admin');

        $response = $this->get('/server_history.php');

        $response->assertOk();
        $response->assertSee('Server History', false);
        $response->assertSee('sh-overview', false);
        $response->assertDontSee('Total Entries', false);
        $response->assertDontSee('Last Updated', false);
        $response->assertSee('Queue #', false);
        $response->assertSee('aria-label="Select all rows on this page"', false);
        $response->assertSee('Queue List', false);
        $response->assertSee('>Filters<', false);
        $response->assertSee('<ul class="sh-chips"', false);
        $response->assertSee('1 active', false);
        $response->assertSee('datepicker-full.min.js', false);
        $response->assertSee('wire:snapshot', false);
        $response->assertSee('aria-current="page"', false);
        $response->assertSee('Export', false);
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
