<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('departments')) {
            return;
        }

        Schema::create('departments', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name', 100);
            $table->string('server', 100)->nullable();
            $table->string('status', 20)->nullable();
            $table->string('prefix', 10)->default('ADM');
        });
    }

    public function down(): void
    {
        if (Schema::hasTable('departments')) {
            Schema::dropIfExists('departments');
        }
    }
};
