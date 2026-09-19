<?php

use App\Http\Controllers\AbtcQueueController;
use App\Http\Controllers\AccountController;
use App\Http\Controllers\AuditTrailController;
use App\Http\Controllers\Auth\LoginController;
use App\Http\Controllers\Auth\LogoutController;
use App\Http\Controllers\Auth\SessionCheckController;
use App\Http\Controllers\DepartmentController;
use App\Http\Controllers\DepartmentManagementController;
use App\Http\Controllers\DisplayController;
use App\Http\Controllers\EditAccountController;
use App\Http\Controllers\LiveMonitorController;
use App\Http\Controllers\PoolController;
use App\Http\Controllers\QueueController;
use App\Http\Controllers\QueueLogsController;
use App\Http\Controllers\SectionController;
use App\Http\Controllers\ServedQueuesController;
use App\Http\Controllers\ServerHistoryController;
use App\Http\Controllers\SidebarController;
use App\Http\Controllers\TakeQueueController;
use App\Http\Controllers\TicketOthersController;
use App\Http\Controllers\TransferController;
use App\Http\Controllers\UserManagementController;
use App\Http\Controllers\WaitingQueueController;
use App\Services\EmitService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::get('login.php', [LoginController::class, 'show'])->name('login.show');
Route::post('login.php', [LoginController::class, 'login'])->name('login.submit');

// The native endpoints keep their exact URL paths so the ported JS works unchanged.

// Sidebar is a fetch() target and answers 401 JSON itself (native sidebar.php),
// so it must NOT go through the single.login redirect middleware.
Route::get('sidebar.php', [SidebarController::class, 'index'])->name('sidebar');

// Public display/monitoring endpoints (native: no auth, no CSRF):
Route::get('get_display_data.php', [DisplayController::class, 'display']);
Route::get('get_live_serving.php', [DisplayController::class, 'liveServing']);
Route::get('get_departments.php', [DepartmentController::class, 'getList']);
Route::get('live.php', [LiveMonitorController::class, 'show']);

// Public ticket kiosks (anonymous ticket machines; single-login only enforced
// when an operator session happens to exist). GET renders, POST issues.
Route::get('waiting_queue.php', [WaitingQueueController::class, 'show']);
Route::post('waiting_queue.php', [WaitingQueueController::class, 'issue']);
Route::get('abtc_queue.php', [AbtcQueueController::class, 'show']);
Route::post('abtc_queue.php', [AbtcQueueController::class, 'issue']);

// Printable ticket page + retired generic issuance page (410 Gone).
Route::get('ticket_others.php', [TicketOthersController::class, 'show']);
Route::get('take_queue.php', [TakeQueueController::class, 'show']);

// logout.php is posted by the sidebar form (native) and redirected to via GET
// (session_check/alerts) — accept both. The sidebar form carries a CSRF token.
Route::match(['GET', 'POST'], 'logout.php', [LogoutController::class, 'logout'])->name('logout');

// session_check is exempt from cross-route single-login middleware: it performs
// its own (stamp-aware) token check and answers with JSON instead of redirecting.
Route::get('session_check.php', [SessionCheckController::class, 'check'])->name('session.check');

Route::middleware('single.login')->group(function (): void {
    Route::match(['GET', 'POST'], 'choose_section.php', function (Request $r, SectionController $sections) {
        if ($r->isMethod('POST') && $r->has('for_customer')) {
            return $sections->forCustomer($r);
        }

        return $sections->choose(false);
    });

    Route::match(['GET', 'POST'], 'choose_waiting_section.php', function (Request $r, SectionController $sections) {
        if ($r->isMethod('POST') && $r->has('for_customer')) {
            return $sections->forCustomer($r);
        }

        return $sections->choose(true);
    });

    Route::post('assign_section.php', fn (Request $r, SectionController $sections) => $sections->assign($r, app(EmitService::class), false));
    Route::post('assign_waiting_section.php', fn (Request $r, SectionController $sections) => $sections->assign($r, app(EmitService::class), true));
    Route::post('release_section.php', [SectionController::class, 'release']);
    Route::get('section_control.php', [SectionController::class, 'control']);
});

// Phase 2b: controller page + core servicing JSON endpoints (native parity).
Route::middleware('single.login')->group(function (): void {
    // '/index.php' collides with the front-controller file (public/index.php):
    // the server then yields pathInfo '/' regardless of SCRIPT_NAME, so the
    // controller is ALSO registered on '/' (matches both built-in server and
    // nginx). The 'index.php' route still helps for non-colliding setups.
    Route::get('/', [QueueController::class, 'index']);
    Route::get('index.php', [QueueController::class, 'index']);
    Route::get('get_queue.php', [QueueController::class, 'getQueue']);
    Route::post('serve_next.php', [QueueController::class, 'serveNext']);
    Route::post('finish.php', [QueueController::class, 'finish']);
    Route::post('queue_action.php', [QueueController::class, 'queueAction']);
    Route::post('repeat_call.php', [QueueController::class, 'repeatCall']);

    // Phase 2c: transfers / prioritization / takeover / password / pool.
    Route::post('transfer_queue.php', [TransferController::class, 'transfer']);
    Route::post('prioritize_queue.php', [TransferController::class, 'prioritize']);
    Route::post('switch_department.php', [DepartmentController::class, 'switch']);
    Route::post('update_password.php', [AccountController::class, 'updatePassword']);
    Route::get('get_pool_waiting.php', [PoolController::class, 'getWaiting']);
    Route::post('serve_pool.php', [PoolController::class, 'serve']);

    // Phase 3c: reports (auth + single-login; queue_logs enforces superadmin).
    Route::get('served_queues.php', [ServedQueuesController::class, 'show']);
    Route::get('server_history.php', [ServerHistoryController::class, 'show']);
    Route::get('queue_logs.php', [QueueLogsController::class, 'show']);

    // Phase 3d: admin / account pages (native auth gates preserved in controllers).
    Route::get('user_management.php', [UserManagementController::class, 'show']);
    Route::post('user_management.php', [UserManagementController::class, 'handle']);
    Route::get('department_management.php', [DepartmentManagementController::class, 'show']);
    Route::post('department_management.php', [DepartmentManagementController::class, 'handle']);
    Route::get('edit_account.php', [EditAccountController::class, 'show']);
    Route::post('edit_account.php', [EditAccountController::class, 'update']);
    Route::get('audit_trail.php', [AuditTrailController::class, 'show']);
});
