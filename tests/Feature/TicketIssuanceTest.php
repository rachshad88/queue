<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class TicketIssuanceTest extends TestCase
{
    use DatabaseTransactions;

    public function test_waiting_kiosk_issues_ticket_and_increments_counter(): void
    {
        $before = (int) DB::table('daily_counters')
            ->where('department_id', 15)
            ->where('day', DB::raw('CONVERT(date, '.config('queue.manila_now').')'))
            ->value('last_number') ?? 0;

        $this->post('/waiting_queue.php', ['take_ticket' => 1])
            ->assertRedirect()
            ->assertRedirectContains('ticket_others.php');

        $after = (int) DB::table('daily_counters')
            ->where('department_id', 15)
            ->where('day', DB::raw('CONVERT(date, '.config('queue.manila_now').')'))
            ->value('last_number');

        $this->assertSame($before + 1, $after);

        $row = DB::table('queue')->where('department_id', 15)
            ->where('status', 'waiting')
            ->orderByDesc('id')
            ->first();

        $this->assertNotNull($row);
        $this->assertSame('regular', $row->category ?? 'regular');
        $this->assertMatchesRegularExpression('/^[A-Z]+-\d{3}$/', (string) $row->queue_number);
    }

    public function test_waiting_kiosk_without_take_ticket_flag_redirects_back(): void
    {
        $this->post('/waiting_queue.php', [])
            ->assertRedirect('/waiting_queue.php');
    }

    public function test_waiting_kiosk_priority_category(): void
    {
        $this->post('/waiting_queue.php', ['take_ticket' => 1, 'category' => 'priority'])
            ->assertRedirect();

        $row = DB::table('queue')->where('department_id', 15)
            ->where('status', 'waiting')
            ->orderByDesc('id')
            ->first();

        $this->assertSame('priority', $row->category ?? 'regular');
    }

    public function test_abtc_kiosk_issues_ticket(): void
    {
        $this->post('/abtc_queue.php', ['take_ticket' => 1])
            ->assertRedirect()
            ->assertRedirectContains('ticket_others.php');

        $row = DB::table('queue')->where('department_id', 8)
            ->where('status', 'waiting')
            ->orderByDesc('id')
            ->first();

        $this->assertNotNull($row);
        $this->assertMatchesRegularExpression('/^[A-Z]+-\d{3}$/', (string) $row->queue_number);
    }

    public function test_abtc_kiosk_without_take_ticket_redirects_back(): void
    {
        $this->post('/abtc_queue.php', [])
            ->assertRedirect('/abtc_queue.php');
    }

    public function test_waiting_kiosk_returns_plain_error_when_inactive(): void
    {
        DB::table('departments')->where('id', 15)->update(['status' => 'inactive']);

        $this->post('/waiting_queue.php', ['take_ticket' => 1])
            ->assertSee('currently inactive', false);
    }
}
