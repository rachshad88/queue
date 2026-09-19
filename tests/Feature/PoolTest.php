<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PoolTest extends TestCase
{
    use DatabaseTransactions;

    public function test_serve_pool_pulls_from_another_clinic(): void
    {
        $this->loginAs('qa_clinic1');
        $id = $this->seedQueueRow(2, 'C2-701', 'waiting', 'regular', 120);

        $this->post('/serve_pool.php', [
            'department_id' => 2,
            'queue_id' => $id,
            'password' => 'testpass!123',
        ])->assertOk()
            ->assertJson(['success' => true, 'queue_number' => 'C2-701']);

        $row = DB::table('queue')->where('id', $id)->first();
        $this->assertSame('serving', $row->status);
        $this->assertSame($this->userId('qa_clinic1'), (int) $row->served_by);
        $this->assertSame(1, (int) $row->department_id);
    }

    public function test_serve_pool_requires_password(): void
    {
        $this->loginAs('qa_clinic1');
        $id = $this->seedQueueRow(2, 'C2-702', 'waiting', 'regular', 120);

        $this->post('/serve_pool.php', ['department_id' => 2, 'queue_id' => $id])
            ->assertOk()
            ->assertJson(['success' => false, 'message' => 'Password required to pull a patient.']);
    }

    public function test_serve_pool_rejects_bad_password(): void
    {
        $this->loginAs('qa_clinic1');
        $id = $this->seedQueueRow(2, 'C2-703', 'waiting', 'regular', 120);

        $this->post('/serve_pool.php', [
            'department_id' => 2,
            'queue_id' => $id,
            'password' => 'wrong',
        ])->assertOk()
            ->assertJson(['success' => false, 'message' => 'Invalid password.']);
    }

    public function test_get_pool_waiting_lists_other_clinics_only(): void
    {
        $this->loginAs('qa_clinic1');
        $this->seedQueueRow(1, 'C1-704', 'waiting', 'regular', 120);
        $this->seedQueueRow(2, 'C2-705', 'waiting', 'regular', 90);
        $this->seedQueueRow(4, 'C3-706', 'waiting', 'regular', 60);

        $json = $this->get('/get_pool_waiting.php')
            ->assertOk()
            ->json();

        $numbers = [];
        foreach ($json['pool'] ?? [] as $dept) {
            foreach ($dept['rows'] as $q) {
                $numbers[] = $q['queue_number'];
            }
        }
        $this->assertNotContains('C1-704', $numbers);
        $this->assertContains('C2-705', $numbers);
        $this->assertContains('C3-706', $numbers);
    }

    public function test_get_pool_waiting_denied_for_non_pooled_dept(): void
    {
        $this->loginAs('qa_abtc');

        $this->get('/get_pool_waiting.php')
            ->assertOk()
            ->assertJson(['success' => false]);
    }
}
