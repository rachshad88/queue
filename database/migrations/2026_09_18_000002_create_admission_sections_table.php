<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('admission_sections')) {
            return;
        }

        Schema::create('admission_sections', function (Blueprint $table) {
            $table->increments('id');
            $table->string('section_name', 50);
            $table->integer('occupied_by')->nullable();
            $table->dateTime('updated_at')->nullable();
            $table->tinyInteger('status')->nullable();
        });

        // Match the live column exactly (nvarchar vs varchar matters to the
        // schema-diff parity check against the production database).
        DB::statement('ALTER TABLE admission_sections ALTER COLUMN section_name varchar(50) NOT NULL');
    }

    public function down(): void
    {
        if (Schema::hasTable('admission_sections')) {
            Schema::dropIfExists('admission_sections');
        }
    }
};
