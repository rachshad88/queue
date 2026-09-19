<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('queue')) {
            return;
        }

        Schema::create('queue', function (Blueprint $table) {
            $table->increments('id');
            $table->unsignedInteger('department_id');
            $table->string('queue_number', 6);
            $table->string('status', 50);
            $table->dateTime('created_at');
            $table->integer('served_by')->nullable();
            $table->string('category', 50)->nullable();
            $table->string('return_code', 10)->nullable();
            $table->dateTime('served_at')->nullable();
        });
    }

    public function down(): void
    {
        if (Schema::hasTable('queue')) {
            Schema::dropIfExists('queue');
        }
    }
};
