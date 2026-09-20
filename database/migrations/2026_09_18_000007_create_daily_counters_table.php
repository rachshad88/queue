<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('daily_counters')) {
            return;
        }

        Schema::create('daily_counters', function (Blueprint $table) {
            $table->unsignedInteger('department_id');
            $table->date('day');
            $table->unsignedInteger('last_number')->default(DB::raw('0'));

            $table->primary(['department_id', 'day']);
        });
    }

    public function down(): void
    {
        if (Schema::hasTable('daily_counters')) {
            Schema::dropIfExists('daily_counters');
        }
    }
};
