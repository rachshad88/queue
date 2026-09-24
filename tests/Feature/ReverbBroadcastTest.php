<?php

namespace Tests\Feature;

use App\Events\QueueUpdated;
use App\Events\RepeatCall;
use App\Http\Middleware\AcceptLegacyCsrfNames;
use App\Services\EmitService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Event;
use InvalidArgumentException;
use Tests\TestCase;

class ReverbBroadcastTest extends TestCase
{
    use DatabaseTransactions;

    public function test_queue_updated_event_validates_payload(): void
    {
        $this->expectException(InvalidArgumentException::class);

        new QueueUpdated(0);
    }

    public function test_repeat_call_event_validates_payload(): void
    {
        $this->expectException(InvalidArgumentException::class);

        new RepeatCall(1, 'CLINIC 1', '', 5);
    }

    public function test_queue_updated_broadcast_shape(): void
    {
        $event = new QueueUpdated(3, 7, 2, 'R-042', 'Admission 2');

        $this->assertSame('queue-updated', $event->broadcastAs());
        $this->assertSame(
            ['dept' => 3, 'user_id' => 7, 'section_id' => 2, 'queue_number' => 'R-042', 'section' => 'Admission 2'],
            $event->broadcastWith()
        );

        $channels = array_map(
            static fn ($c) => $c->name,
            $event->broadcastOn()
        );
        $this->assertContains('queue-display', $channels);
        $this->assertContains('private-dept.3', $channels);
    }

    public function test_dept_channel_denies_guests(): void
    {
        $this->withoutMiddleware(AcceptLegacyCsrfNames::class);

        $this->postJson('/broadcasting/auth', [
            'socket_id' => '1.1',
            'channel_name' => 'private-dept.1',
        ])->assertForbidden();
    }

    public function test_dept_channel_allows_own_department(): void
    {
        $this->withoutMiddleware(AcceptLegacyCsrfNames::class);
        $this->loginAs('qa_clinic1');

        $this->postJson('/broadcasting/auth', [
            'socket_id' => '1.1',
            'channel_name' => 'private-dept.1',
        ])
            ->assertOk()
            ->assertJsonStructure(['auth']);
    }

    public function test_dept_channel_denies_other_department(): void
    {
        $this->withoutMiddleware(AcceptLegacyCsrfNames::class);
        $this->loginAs('qa_clinic1');

        $this->postJson('/broadcasting/auth', [
            'socket_id' => '1.1',
            'channel_name' => 'private-dept.2',
        ])->assertForbidden();
    }

    public function test_dept_channel_allows_superadmin_anywhere(): void
    {
        $this->withoutMiddleware(AcceptLegacyCsrfNames::class);
        $this->loginAs('qa_superadmin');

        $this->postJson('/broadcasting/auth', [
            'socket_id' => '1.1',
            'channel_name' => 'private-dept.8',
        ])
            ->assertOk()
            ->assertJsonStructure(['auth']);
    }

    public function test_emit_is_fail_open_without_reverb_server(): void
    {
        // No Reverb server runs in tests: this must not throw (parallel to
        // the legacy :3000 path, which is equally fail-open).
        app(EmitService::class)->emit('queue-updated', ['dept' => 1, 'queue_number' => 'R-001']);
        app(EmitService::class)->emit('repeat-call', [
            'department_id' => 1,
            'department_name' => 'CLINIC 1',
            'queue_number' => 'R-001',
            'user_id' => $this->userId('qa_clinic1'),
        ]);

        $this->assertTrue(true);
    }

    public function test_repeat_call_without_dept_skips_reverb_broadcast(): void
    {
        Event::fake();

        // Legacy repeat_call.php shape has no 'dept' key: the Reverb path
        // must drop it instead of broadcasting a malformed event.
        app(EmitService::class)->emit('repeat-call', [
            'department_id' => 1,
            'department_name' => 'CLINIC 1',
            'queue_number' => 'R-001',
            'user_id' => $this->userId('qa_clinic1'),
        ]);

        // broadcast() dispatches the event itself through the dispatcher
        // (PendingBroadcast::__destruct), so Event::fake() captures it.
        Event::assertNotDispatched(RepeatCall::class);
    }

    public function test_repeat_call_with_dept_broadcasts_reverb_event(): void
    {
        Event::fake();

        // QueueController::repeatCall payload shape (carries both keys).
        app(EmitService::class)->emit('repeat-call', [
            'dept' => 1,
            'department_id' => 1,
            'department_name' => 'CLINIC 1',
            'queue_number' => 'R-001',
            'user_id' => $this->userId('qa_clinic1'),
        ]);

        Event::assertDispatched(
            RepeatCall::class,
            static fn (RepeatCall $e) => $e->queueNumber === 'R-001'
        );
    }
}
