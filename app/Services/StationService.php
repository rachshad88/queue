<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Session;

/**
 * Port of the native PHP app's section helpers (app/sections.php).
 */
class StationService
{
    public const ADMISSION_TABLE = 'admission_sections';

    public const WAITING_TABLE = 'waiting_sections';

    public function sectionTables(): array
    {
        return [self::ADMISSION_TABLE, self::WAITING_TABLE];
    }

    public function sectionsTableForDept(int $deptId, ?string $deptName = ''): ?string
    {
        $name = strtoupper(trim((string) $deptName));
        if ($deptId === (int) config('queue.admission_dept_id') || str_contains($name, 'ADMISSION')) {
            return self::ADMISSION_TABLE;
        }
        if ($deptId === (int) config('queue.waiting_dept_id') || str_contains($name, 'WAITING')) {
            return self::WAITING_TABLE;
        }

        return null;
    }

    public function sectionServesPriority(int $sectionId, ?string $table = null): bool
    {
        $table = strtolower(trim((string) $table));
        if ($table === self::ADMISSION_TABLE) {
            return in_array($sectionId, [3, 4], true);
        }
        if ($table === self::WAITING_TABLE) {
            return in_array($sectionId, [1, 2], true);
        }

        return false;
    }

    /** Heartbeat: refresh updated_at on every window this staffer occupies. */
    public function markSectionActivity(int $userId): void
    {
        if ($userId < 1) {
            return;
        }
        foreach ($this->sectionTables() as $table) {
            DB::table($table)
                ->where('occupied_by', $userId)
                ->where('status', 1)
                ->update(['updated_at' => DB::raw(config('queue.manila_now'))]);
        }
    }

    /**
     * Effective section ['id','section_name'] for an operator on a sectioned
     * department, or null. Superadmins never occupy rows (session-scoped
     * takeover), so their chosen window wins over any occupancy lookup.
     */
    public function operatorSection(int $userId, int $deptId): ?object
    {
        if ($userId < 1) {
            return null;
        }

        if (! empty(Session::get('is_superadmin', false))
            && ! empty(Session::get('takeover_section_id'))
            && (int) Session::get('department_id', 0) === $deptId
            && ! empty(Session::get('takeover_section_table'))
            && in_array(strtolower((string) Session::get('takeover_section_table')), $this->sectionTables(), true)) {
            $table = strtolower((string) Session::get('takeover_section_table'));
            $row = DB::table($table)
                ->select('id', 'section_name')
                ->where('id', (int) Session::get('takeover_section_id'))
                ->first();

            return $row ?: null;
        }

        $table = $this->sectionsTableForDept($deptId, (string) Session::get('department', ''));
        if ($table === null) {
            return null;
        }

        return DB::table($table)
            ->select('id', 'section_name')
            ->where('occupied_by', $userId)
            ->where('status', 1)
            ->first() ?: null;
    }

    /** Release windows abandoned more than $minutes ago. */
    public function releaseStaleSections(int $minutes = 30): void
    {
        foreach ($this->sectionTables() as $table) {
            DB::table($table)
                ->where('status', 1)
                ->whereNotNull('occupied_by')
                ->where('updated_at', '<', DB::raw('DATEADD(MINUTE, '.(0 - abs($minutes)).', '.config('queue.manila_now').')'))
                ->update([
                    'occupied_by' => null,
                    'status' => 0,
                    'updated_at' => DB::raw(config('queue.manila_now')),
                ]);
        }
    }

    /** Release every window occupied by this operator (logout). */
    public function releaseSectionsForUser(int $userId): void
    {
        foreach ($this->sectionTables() as $table) {
            DB::table($table)
                ->where('occupied_by', $userId)
                ->update([
                    'occupied_by' => null,
                    'status' => 0,
                    'updated_at' => DB::raw(config('queue.manila_now')),
                ]);
        }
    }
}
