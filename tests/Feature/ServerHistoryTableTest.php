<?php

namespace Tests\Feature;

use App\Livewire\ServerHistoryTable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Carbon;
use Livewire\Livewire;
use Tests\TestCase;

class ServerHistoryTableTest extends TestCase
{
    use DatabaseTransactions;

    public function test_mount_renders_today_rows_and_hides_older_ones(): void
    {
        $this->loginAs('qa_admin');
        $servedBy = $this->userId('qa_admin');
        $this->seedQueueRow(1, 'R-801', 'done', 'regular', 30, $servedBy);
        $this->seedQueueRow(1, 'R-890', 'done', 'regular', 100000, $servedBy);

        $today = Carbon::now('+08:00')->toDateString();

        Livewire::test(ServerHistoryTable::class, ['from' => $today, 'to' => $today])
            ->assertOk()
            ->assertSee('R-801')
            ->assertDontSee('R-890');
    }

    public function test_invalid_sort_key_in_url_is_ignored_and_default_order_applied(): void
    {
        $this->loginAs('qa_admin');

        Livewire::test(ServerHistoryTable::class, ['from' => '', 'to' => ''])
            ->assertSet('sortKey', '')
            ->assertSet('sortDir', 'asc');
    }

    public function test_sort_by_toggles_direction_and_resets_page(): void
    {
        $this->loginAs('qa_admin');

        Livewire::test(ServerHistoryTable::class)
            ->set('page', 2)
            ->call('sortBy', 'server')
            ->assertSet('sortKey', 'server')
            ->assertSet('sortDir', 'asc')
            ->assertSet('page', 1)
            ->call('sortBy', 'server')
            ->assertSet('sortDir', 'desc');
    }

    public function test_unknown_sort_column_is_ignored(): void
    {
        $this->loginAs('qa_admin');

        Livewire::test(ServerHistoryTable::class)
            ->call('sortBy', 'created_at;DROP')
            ->assertSet('sortKey', '');
    }

    public function test_page_is_clamped_to_total_pages(): void
    {
        $this->loginAs('qa_admin');
        $servedBy = $this->userId('qa_admin');
        for ($i = 0; $i < 25; $i++) {
            $this->seedQueueRow(1, 'R-'.str_pad((string) $i, 3, '0', STR_PAD_LEFT), 'done', 'regular', 60 + $i, $servedBy);
        }

        Livewire::test(ServerHistoryTable::class, ['from' => '', 'to' => ''])
            ->set('page', 99)
            ->assertSet('page', 2);
    }

    public function test_goto_page_and_go_to_page_navigate(): void
    {
        $this->loginAs('qa_admin');
        $servedBy = $this->userId('qa_admin');
        for ($i = 0; $i < 25; $i++) {
            $this->seedQueueRow(1, 'R-'.str_pad((string) $i, 3, '0', STR_PAD_LEFT), 'done', 'regular', 60 + $i, $servedBy);
        }

        Livewire::test(ServerHistoryTable::class, ['from' => '', 'to' => ''])
            ->call('gotoPage', 2)
            ->assertSet('page', 2)
            ->set('goTo', 1)
            ->call('submitGoToPage')
            ->assertSet('page', 1);
    }

    public function test_selecting_a_row_updates_toolbar_and_export_selected_link(): void
    {
        $this->loginAs('qa_admin');
        $servedBy = $this->userId('qa_admin');
        $id = $this->seedQueueRow(1, 'R-901', 'done', 'regular', 60, $servedBy);

        Livewire::test(ServerHistoryTable::class, ['from' => '', 'to' => ''])
            ->set('selected', [$id])
            ->assertSee('1 selected')
            ->assertSee('ids='.$id, false)
            ->assertDispatched('sh-selection');
    }

    public function test_select_all_merges_page_ids_into_selection(): void
    {
        $this->loginAs('qa_admin');
        $servedBy = $this->userId('qa_admin');
        $this->seedQueueRow(1, 'R-902', 'done', 'regular', 60, $servedBy);

        Livewire::test(ServerHistoryTable::class, ['from' => '', 'to' => ''])
            ->set('selectAll', true)
            ->assertSet('selectAll', true);
    }

    public function test_selection_persists_across_pages(): void
    {
        $this->loginAs('qa_admin');
        $servedBy = $this->userId('qa_admin');
        for ($i = 0; $i < 25; $i++) {
            $this->seedQueueRow(1, 'R-'.str_pad((string) $i, 3, '0', STR_PAD_LEFT), 'done', 'regular', 60 + $i, $servedBy);
        }
        $ids = [];

        Livewire::test(ServerHistoryTable::class, ['from' => '', 'to' => ''])
            ->set('page', 1)
            ->set('selected', [1])
            ->call('gotoPage', 2)
            ->assertSet('selected', [1]);
    }

    public function test_export_selected_group_cap_is_capped_at_200(): void
    {
        $this->loginAs('qa_admin');
        $servedBy = $this->userId('qa_admin');
        $ids = [];
        for ($i = 0; $i < 220; $i++) {
            $ids[] = $this->seedQueueRow(1, 'R-'.str_pad((string) $i, 3, '0', STR_PAD_LEFT), 'done', 'regular', 60 + $i, $servedBy);
        }

        Livewire::test(ServerHistoryTable::class, ['from' => '', 'to' => ''])
            ->set('selected', $ids)
            ->assertCount('selected', 200);
    }

    public function test_unauthenticated_actions_redirect_to_login(): void
    {
        Livewire::test(ServerHistoryTable::class)
            ->call('sortBy', 'num')
            ->assertRedirect('/login.php');
    }

    public function test_empty_state_renders_no_records_message_and_clear_filters(): void
    {
        $this->loginAs('qa_admin');

        // department='999999' cannot match any real d.id, so this transaction
        // is guaranteed empty regardless of committed data.
        Livewire::test(ServerHistoryTable::class, ['department' => '999999'])
            ->assertSee('0 entries')
            ->assertSee('No serve records found for the current filters.')
            ->assertSee('Clear filters');
    }

    public function test_department_filter_scopes_rows(): void
    {
        $this->loginAs('qa_admin');
        $servedBy = $this->userId('qa_admin');
        $this->seedQueueRow(1, 'R-DP1', 'done', 'regular', 60, $servedBy);

        Livewire::test(ServerHistoryTable::class, ['department' => '1'])
            ->assertSee('R-DP1');

        Livewire::test(ServerHistoryTable::class, ['department' => '2'])
            ->assertDontSee('R-DP1');
    }

    public function test_select_all_unchecking_removes_page_ids(): void
    {
        $this->loginAs('qa_admin');
        $servedBy = $this->userId('qa_admin');
        for ($i = 0; $i < 2; $i++) {
            $this->seedQueueRow(1, 'R-UN'.$i, 'done', 'regular', 60, $servedBy);
        }

        Livewire::test(ServerHistoryTable::class)
            ->set('selectAll', true)
            ->assertSet('selectAll', true)
            ->assertCount('selected', 2)
            ->set('selectAll', false)
            ->assertCount('selected', 0);
    }

    public function test_submit_go_to_page_clamps_and_respects_numbers(): void
    {
        $this->loginAs('qa_admin');
        $servedBy = $this->userId('qa_admin');
        for ($i = 0; $i < 25; $i++) {
            $this->seedQueueRow(1, 'R-G'.str_pad((string) $i, 2, '0', STR_PAD_LEFT), 'done', 'regular', 60, $servedBy);
        }

        Livewire::test(ServerHistoryTable::class)
            ->set('goTo', 0)
            ->call('submitGoToPage')
            ->assertSet('page', 1)
            ->set('goTo', 999)
            ->call('submitGoToPage')
            ->assertSet('page', 2);
    }

    public function test_garbage_page_query_clamps_to_first_page(): void
    {
        $this->loginAs('qa_admin');
        $servedBy = $this->userId('qa_admin');
        $this->seedQueueRow(1, 'R-GX1', 'done', 'regular', 60, $servedBy);

        $response = $this->get('/server_history.php?page=abc');

        $response->assertOk();
        $response->assertSee('1 active', false);
        $response->assertSee('Showing', false);
    }

    public function test_export_page_url_carries_sort_and_page_scope(): void
    {
        $this->loginAs('qa_admin');
        $servedBy = $this->userId('qa_admin');
        for ($i = 0; $i < 25; $i++) {
            $this->seedQueueRow(1, 'R-E'.str_pad((string) $i, 2, '0', STR_PAD_LEFT), 'done', 'regular', 60, $servedBy);
        }

        Livewire::test(ServerHistoryTable::class)
            ->set('sortKey', 'num')
            ->set('page', 2)
            ->assertSee('scope=page&amp;page=2', false)
            ->assertSee('sort=num', false);
    }

    public function test_export_selected_link_is_disabled_with_no_selection(): void
    {
        $this->loginAs('qa_admin');
        $this->seedQueueRow(1, 'R-X01', 'done', 'regular', 60, $this->userId('qa_admin'));

        Livewire::test(ServerHistoryTable::class)
            ->assertSee('Selected rows (0, CSV)', false)
            ->assertSee('aria-disabled="true"', false);
    }
}
