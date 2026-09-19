<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use PDO;

/**
 * Baseline clinic structure for a fresh install: the real clinical departments
 * and the four admission / four waiting section desks. Identities are inserted
 * explicitly so downstream code that hardcodes department 3 (admission) and
 * department 15 (waiting area) keeps working on an empty database.
 *
 * Safe to re-run: rows are only inserted when the table is empty. The identity
 * toggles run through the same raw PDO that performs the inserts, because the
 * SQL Server driver dispatches `DB::statement()` and query-builder writes to
 * different PDO handles.
 */
class ClinicBaselineSeeder extends Seeder
{
    public function run(): void
    {
        $departments = [
            ['id' => 1, 'name' => 'CLINIC 1', 'server' => 'Dr. John Patrick B. Montemayor', 'status' => 'active', 'prefix' => 'C1'],
            ['id' => 2, 'name' => 'CLINIC 2', 'server' => 'Dr. Niña Angela V. Galiste-Monta', 'status' => 'active', 'prefix' => 'C2'],
            ['id' => 3, 'name' => 'ADMISSION', 'server' => '', 'status' => 'active', 'prefix' => 'AD'],
            ['id' => 4, 'name' => 'CLINIC 3', 'server' => 'Dr. Princess Jenarca D. Dela Rosa', 'status' => 'active', 'prefix' => 'C3'],
            ['id' => 5, 'name' => 'LABORATORY', 'server' => '', 'status' => 'active', 'prefix' => 'LAB'],
            ['id' => 6, 'name' => 'PHARMACY', 'server' => 'Mildred D. Jacob', 'status' => 'active', 'prefix' => 'PH'],
            ['id' => 7, 'name' => 'DENTAL', 'server' => 'Dr. Jannette Beverly C. Sta. Ines', 'status' => 'active', 'prefix' => 'DEN'],
            ['id' => 8, 'name' => 'ABTC', 'server' => 'Jefferson A. Flores', 'status' => 'active', 'prefix' => 'ABTC'],
            ['id' => 9, 'name' => 'NUTRITION', 'server' => 'Sheena Mae G. Braceros', 'status' => 'active', 'prefix' => 'NUT'],
            ['id' => 12, 'name' => 'CLINIC 4', 'server' => 'Dr. Ernesto C. Panganiban', 'status' => 'active', 'prefix' => 'C4'],
            ['id' => 13, 'name' => 'TB-DOTS', 'server' => 'Federico D. Bolusan', 'status' => 'active', 'prefix' => 'TB'],
            ['id' => 14, 'name' => 'VETERINARY', 'server' => 'Mascot Wally G. del Rosario', 'status' => 'active', 'prefix' => 'VET'],
            ['id' => 15, 'name' => 'WAITING AREA', 'server' => '', 'status' => 'active', 'prefix' => 'WA'],
        ];

        if (DB::table('departments')->count() === 0) {
            $this->identityInsert('departments', ['id', 'name', 'server', 'status', 'prefix'], $departments);
        }

        foreach (['admission_sections' => 'Admission', 'waiting_sections' => 'Waiting Area'] as $table => $label) {
            if (DB::table($table)->count() === 0) {
                $rows = array_map(fn (int $i): array => [
                    'id' => $i,
                    'section_name' => "$label $i",
                    'occupied_by' => null,
                    'updated_at' => null,
                    'status' => 1,
                ], [1, 2, 3, 4]);

                $this->identityInsert($table, ['id', 'section_name', 'occupied_by', 'updated_at', 'status'], $rows);
            }
        }
    }

    /**
     * Insert rows with explicit identity values on a single raw PDO session.
     *
     * @param  array<int, array<string, mixed>>  $rows
     */
    private function identityInsert(string $table, array $columns, array $rows): void
    {
        $pdo = DB::connection()->getPdo();
        $pdo->setAttribute(PDO::ATTR_EMULATE_PREPARES, false);

        $quoted = array_map(fn (string $c): string => "[$c]", $columns);
        $placeholders = implode(', ', array_fill(0, count($columns), '?'));
        $stmt = $pdo->prepare("insert into [$table] (".implode(', ', $quoted).") values ($placeholders)");

        $pdo->exec("SET IDENTITY_INSERT [$table] ON");
        try {
            foreach ($rows as $row) {
                $stmt->execute(array_map(fn (string $c): mixed => $row[$c], $columns));
            }
        } finally {
            $pdo->exec("SET IDENTITY_INSERT [$table] OFF");
        }
    }
}
