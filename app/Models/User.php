<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    protected $table = 'users';

    protected $primaryKey = 'user_id';

    protected $keyType = 'int';

    public $incrementing = true;

    public $timestamps = false;

    protected $hidden = ['password', 'login_token'];

    protected $fillable = [
        'username',
        'password',
        'usertype',
        'firstname',
        'lastname',
        'middlename',
        'position',
        'department',
        'department_id',
        'status',
    ];

    protected function casts(): array
    {
        return [
            'password' => 'hashed',
            'department_id' => 'integer',
        ];
    }

    public function isSuperadmin(): bool
    {
        return strtolower(trim((string) $this->usertype)) === 'superadmin';
    }
}
