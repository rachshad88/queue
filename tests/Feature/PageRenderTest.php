<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

class PageRenderTest extends TestCase
{
    use DatabaseTransactions;

    public function test_controller_page_renders_for_superadmin(): void
    {
        $this->loginAs('qa_superadmin');

        $this->get('/index.php')
            ->assertOk()
            ->assertSee('reverb.js', false)
            ->assertSee('window._REVERB', false);
    }

    public function test_controller_page_renders_for_clinic_staff(): void
    {
        $this->loginAs('qa_clinic1');

        $this->get('/index.php')->assertOk();
    }

    public function test_live_wall_renders_publicly(): void
    {
        $this->get('/live.php')
            ->assertOk()
            ->assertSee('window._REVERB', false);
    }
}
