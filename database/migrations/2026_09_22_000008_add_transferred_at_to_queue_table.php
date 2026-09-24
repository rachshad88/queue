<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('queue') || Schema::hasColumn('queue', 'transferred_at')) {
            return;
        }

        Schema::table('queue', function (Blueprint $table) {
            $table->dateTime('transferred_at')->nullable()->after('served_at');
        });

        // Backfill from the audit trail: latest transferred_in stamp per
        // ticket+department. Rows never transferred stay NULL (= arrival is
        // created_at).
        DB::statement(
            'UPDATE q SET transferred_at = t.mt
              FROM queue q
              JOIN (SELECT queue_id, department_id, MAX(created_at) AS mt
                     FROM queue_log WHERE action = \'transferred_in\'
                     GROUP BY queue_id, department_id) t
                ON t.queue_id = q.id AND t.department_id = q.department_id
              WHERE q.transferred_at IS NULL'
        );
    }

    public function down(): void
    {
        if (Schema::hasTable('queue') && Schema::hasColumn('queue', 'transferred_at')) {
            Schema::table('queue', function (Blueprint $table) {
                $table->dropColumn('transferred_at');
            });
        }
    }
};
