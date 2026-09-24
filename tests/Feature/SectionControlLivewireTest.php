<?php

namespace Tests\Feature;

use App\Livewire\SectionsControl;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Livewire\Livewire;
use Tests\TestCase;

class SectionControlLivewireTest extends TestCase
{
    use DatabaseTransactions;

    protected function seedSection(string $table, string $name, ?int $occupiedBy = null): int
    {
        return (int) DB::table($table)->insertGetId([
            'section_name' => $name,
            'occupied_by' => $occupiedBy,
            'status' => $occupiedBy ? 1 : 0,
            'updated_at' => DB::raw(config('queue.manila_now')),
        ]);
    }

    public function test_superadmin_sees_both_window_tables(): void
    {
        $this->loginAs('qa_superadmin');
        $this->seedSection('admission_sections', 'Admission Window 1');
        $this->seedSection('waiting_sections', 'Waiting Bay 1');

        Livewire::test(SectionsControl::class)
            ->assertOk()
            ->assertSee('Admission Window 1')
            ->assertSee('Waiting Bay 1');
    }

    public function test_superadmin_can_release_an_occupied_section(): void
    {
        $this->loginAs('qa_superadmin');
        $staff = $this->userId('qa_admission');
        $id = $this->seedSection('admission_sections', 'Admission Window 2', $staff);

        Livewire::test(SectionsControl::class)
            ->call('release', 'admission', $id)
            ->assertDispatched('toast');

        $this->assertSame(0, (int) DB::table('admission_sections')->where('id', $id)->value('status'));
        $this->assertNull(DB::table('admission_sections')->where('id', $id)->value('occupied_by'));
    }

    public function test_non_superadmin_cannot_release_an_occupied_section(): void
    {
        $this->loginAs('qa_clinic1');
        $staff = $this->userId('qa_admission');
        $id = $this->seedSection('waiting_sections', 'Waiting Bay 2', $staff);

        Livewire::test(SectionsControl::class)
            ->call('release', 'waiting', $id)
            ->assertDispatched('toast');

        $this->assertSame(1, (int) DB::table('waiting_sections')->where('id', $id)->value('status'));
        $this->assertNotNull(DB::table('waiting_sections')->where('id', $id)->value('occupied_by'));
    }

    public function test_release_of_free_section_is_idempotent(): void
    {
        $this->loginAs('qa_superadmin');
        $id = $this->seedSection('admission_sections', 'Admission Window 3');

        Livewire::test(SectionsControl::class)
            ->call('release', 'admission', $id)
            ->assertDispatched('toast');

        $this->assertSame(0, (int) DB::table('admission_sections')->where('id', $id)->value('status'));
    }
}
