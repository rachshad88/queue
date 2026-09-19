<?php

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;

/**
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    /**
     * The current password being used by the factory.
     */
    protected static ?string $password;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'username' => fake()->unique()->userName(),
            'password' => static::$password ??= Hash::make('password'),
            'usertype' => 'staff',
            'firstname' => fake()->firstName(),
            'lastname' => fake()->lastName(),
            'middlename' => fake()->optional()->lastName(),
            'position' => fake()->optional()->jobTitle(),
            'department' => 'General',
            'department_id' => null,
            'status' => 'active',
        ];
    }

    /**
     * Mark the account as using the default password ('12345').
     */
    public function defaultPassword(): static
    {
        return $this->state(fn (array $attributes) => [
            'password' => Hash::make('12345'),
        ]);
    }

    /**
     * Assign a department.
     */
    public function department(int $id, string $name): static
    {
        return $this->state(fn (array $attributes) => [
            'department' => $name,
            'department_id' => $id,
        ]);
    }
}
