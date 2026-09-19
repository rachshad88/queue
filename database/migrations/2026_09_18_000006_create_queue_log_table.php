<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('queue_log')) {
            return;
        }

        Schema::create('queue_log', function (Blueprint $table) {
            $table->increments('id');
            $table->integer('queue_id');
            $table->string('queue_number', 20);
            $table->integer('department_id');
            $table->integer('user_id')->nullable();
            $table->string('action', 50);
            $table->integer('old_department_id')->nullable();
            $table->string('old_status', 50)->nullable();
            $table->string('new_status', 50)->nullable();
            $table->dateTime('created_at');
            $table->string('client_ip', 45)->nullable();
        });
    }

    public function down(): void
    {
        if (Schema::hasTable('queue_log')) {
            Schema::dropIfExists('queue_log');
        }
    }
};
