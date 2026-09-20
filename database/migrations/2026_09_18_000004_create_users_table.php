<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('users')) {
            return;
        }

        Schema::create('users', function (Blueprint $table) {
            $table->increments('user_id');
            $table->string('username', 50);
            $table->string('password', 255);
            $table->string('usertype', 50);
            $table->string('firstname', 100);
            $table->string('lastname', 100);
            $table->string('middlename', 100)->nullable();
            $table->string('position', 100)->nullable();
            $table->string('department', 100)->nullable();
            $table->integer('department_id')->nullable();
            $table->string('status', 50)->default('active');
            $table->string('login_token', 128)->nullable();
            $table->dateTime('last_active')->nullable();
            $table->dateTime('last_login_at')->nullable();
            $table->string('last_ip', 45)->nullable();
        });
    }

    public function down(): void
    {
        if (Schema::hasTable('users')) {
            Schema::dropIfExists('users');
        }
    }
};
