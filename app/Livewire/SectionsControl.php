<?php

namespace App\Livewire;

use App\Models\User;
use App\Services\EmitService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Session;
use Livewire\Component;

/**
 * Superadmin section-control tables (admission + waiting windows).
 *
 * Port of section_control.php + release_section.php as a Livewire 3
 * inline component so release happens reactively (no page reload).
 */
class SectionsControl extends Component
{
    public function render()
    {
        // The tables expose the staff roster: only superadmins may see them.
        // (The page route is gated too; this is defense in depth.)
        if (empty(Session::get('is_superadmin', false))) {
            return view('livewire.sections-control', ['admission' => [], 'waiting' => []]);
        }

        $staff = User::query()
            ->where('usertype', '<>', 'superadmin')
            ->where(function ($q) {
                $q->where('department_id', (int) config('queue.admission_dept_id'))
                    ->orWhere('department_id', (int) config('queue.waiting_dept_id'));
            })
            ->get(['user_id', 'firstname', 'lastname', 'username', 'department_id'])
            ->keyBy('user_id');

        $data = ['admission' => [], 'waiting' => []];

        foreach (['admission' => 'admission_sections', 'waiting' => 'waiting_sections'] as $key => $table) {
            $data[$key] = DB::table($table)
                ->orderBy('id')
                ->get()
                ->map(function ($s) use ($staff) {
                    $s->occupant_name = null;
                    if (! empty($s->occupied_by) && $staff->has($s->occupied_by)) {
                        $u = $staff->get($s->occupied_by);
                        $s->occupant_name = trim(($u->firstname ?? '').' '.($u->lastname ?? ''));
                        $s->occupant_user = $u->username;
                    }

                    return $s;
                });
        }

        return view('livewire.sections-control', $data);
    }

    public function release(string $type, int $sectionId)
    {
        if (empty(Session::get('is_superadmin', false))) {
            $this->dispatch('toast', message: 'Access denied', type: 'error');

            return;
        }

        $type = strtolower(trim($type));
        $map = [
            'admission' => ['table' => 'admission_sections', 'dept' => (int) config('queue.admission_dept_id')],
            'waiting' => ['table' => 'waiting_sections', 'dept' => (int) config('queue.waiting_dept_id')],
        ];

        if (! isset($map[$type])) {
            $this->dispatch('toast', message: 'Invalid section type', type: 'error');

            return;
        }

        $table = $map[$type]['table'];
        $row = DB::table($table)->where('id', $sectionId)->first(['id', 'section_name', 'occupied_by', 'status']);

        if (! $row) {
            $this->dispatch('toast', message: 'Section not found', type: 'error');

            return;
        }
        if (empty($row->occupied_by) || (int) $row->status !== 1) {
            $this->dispatch('toast', message: 'Section is already free', type: 'info');

            return;
        }

        $affected = DB::table($table)
            ->where('id', $sectionId)
            ->where('occupied_by', $row->occupied_by)
            ->update([
                'occupied_by' => null,
                'status' => 0,
                'updated_at' => DB::raw(config('queue.manila_now')),
            ]);

        if ($affected !== 1) {
            $this->dispatch('toast', message: 'Failed to release section', type: 'error');

            return;
        }

        app(EmitService::class)->queueUpdated($map[$type]['dept']);

        $this->dispatch('toast', message: $row->section_name.' released', type: 'success');
    }
}
