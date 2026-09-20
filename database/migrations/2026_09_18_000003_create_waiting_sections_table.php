<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('waiting_sections')) {
            return;
        }

        Schema::create('waiting_sections', function (Blueprint $table) {
            $table->increments('id');
            $table->string('section_name', 50);
            $table->integer('occupied_by')->nullable();
            $table->dateTime('updated_at')->nullable();
            $table->tinyInteger('status')->default(DB::raw('0'));
        });
    }

    public function down(): void
    {
        if (Schema::hasTable('waiting_sections')) {
            Schema::dropIfExists('waiting_sections');
        }
    }
};
