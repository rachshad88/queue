<?php

namespace App\Http\Controllers;

use App\Services\EmitService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Session;

/**
 * Port of the native section chooser + assign/release endpoints.
 *
 * choose_section.php       (admission)  and choose_waiting_section.php (waiting)
 * assign_section.php       (admission)  and assign_waiting_section.php (waiting)
 * release_section.php      (superadmin)
 * section_control.php      (superadmin)
 */
class SectionController extends Controller
{
    public function choose(bool $waiting)
    {
        $table = $waiting ? 'waiting_sections' : 'admission_sections';
        $dept = $waiting ? (int) config('queue.waiting_dept_id') : (int) config('queue.admission_dept_id');

        // Window rosters expose staff names: staff may only view their own
        // department's chooser (superadmins may view both).
        if (empty(Session::get('is_superadmin', false)) && (int) Session::get('department_id', 0) !== $dept) {
            return redirect('index.php');
        }

        $sections = DB::select(
            "SELECT s.id, s.section_name, s.occupied_by,
                    CASE WHEN u.user_id IS NOT NULL THEN RTRIM(u.firstname) + ' ' + RTRIM(u.lastname) ELSE NULL END AS occupant_name,
                    u.username
             FROM {$table} s
             LEFT JOIN users u ON s.occupied_by = u.user_id
             ORDER BY s.id"
        );

        return view($waiting ? 'sections.choose_waiting' : 'sections.choose', [
            'sections' => $sections,
            'canOverrideDept' => $dept,
        ]);
    }

    public function forCustomer(Request $request)
    {
        Session::put('view_mode', 'for_customer');
        Session::put('for_customer_section', (int) $request->input('section_id', 0));

        return redirect('index.php');
    }

    public function assign(Request $request, EmitService $emit, bool $waiting)
    {
        $table = $waiting ? 'waiting_sections' : 'admission_sections';
        $dept = $waiting ? (int) config('queue.waiting_dept_id') : (int) config('queue.admission_dept_id');
        $chooser = $waiting ? 'choose_waiting_section.php' : 'choose_section.php';

        $userId = (int) Session::get('user_id', 0);
        $sectionId = (int) $request->input('section_id', 0);

        if ($userId < 1 || $sectionId < 1) {
            return response('Invalid request', 400);
        }

        // Override (force-claim an occupied window) only for this department's
        // own staff accounts; never from a different department context.
        $override = (bool) $request->input('override', false);
        if ($override && (int) Session::get('department_id', 0) !== $dept) {
            return response('Invalid request', 400);
        }

        // Always clear any section previously held by this user.
        DB::table($table)->where('occupied_by', $userId)->update([
            'occupied_by' => null,
            'status' => 0,
            'updated_at' => DB::raw(config('queue.manila_now')),
        ]);

        $claimed = false;
        if ($override) {
            // Force-claim: free the target even if another staff holds it, then
            // take it for this user (displaced occupant returns to "no window").
            DB::table($table)->where('id', $sectionId)->update([
                'occupied_by' => null,
                'status' => 0,
                'updated_at' => DB::raw(config('queue.manila_now')),
            ]);

            $claimed = DB::table($table)->where('id', $sectionId)->update([
                'occupied_by' => $userId,
                'status' => 1,
                'updated_at' => DB::raw(config('queue.manila_now')),
            ]) === 1;
        } else {
            // Atomic claim: only succeeds while the window is still free, so two
            // concurrent users can never take the same window.
            $claimed = DB::table($table)->where('id', $sectionId)->whereNull('occupied_by')->update([
                'occupied_by' => $userId,
                'status' => 1,
                'updated_at' => DB::raw(config('queue.manila_now')),
            ]) === 1;
        }

        if ($claimed) {
            $name = DB::table($table)->where('id', $sectionId)->value('section_name');
            Session::put('served_by', $name);

            $emit->queueUpdated($dept);

            return redirect('index.php');
        }

        $emit->queueUpdated($dept);
        $taken = $request->input('override') ? '' : "alert('That section was already taken!'); ";

        return response("<script>{$taken}window.location='{$chooser}';</script>", 200)->header('Content-Type', 'text/html');
    }

    public function release(Request $request, EmitService $emit)
    {
        if (empty(Session::get('is_superadmin', false))) {
            return response()->json(['success' => false, 'message' => 'Access denied']);
        }

        $type = strtolower(trim((string) $request->input('type', '')));
        $sectionId = (int) $request->input('section_id', 0);

        $map = [
            'admission' => ['table' => 'admission_sections', 'dept' => (int) config('queue.admission_dept_id')],
            'waiting' => ['table' => 'waiting_sections', 'dept' => (int) config('queue.waiting_dept_id')],
        ];

        if (! isset($map[$type])) {
            return response()->json(['success' => false, 'message' => 'Invalid section type']);
        }
        if ($sectionId < 1) {
            return response()->json(['success' => false, 'message' => 'Section ID is required']);
        }

        $table = $map[$type]['table'];
        $row = DB::table($table)->where('id', $sectionId)->first(['id', 'section_name', 'occupied_by', 'status']);

        if (! $row) {
            return response()->json(['success' => false, 'message' => 'Section not found']);
        }
        if (empty($row->occupied_by) || (int) $row->status !== 1) {
            return response()->json(['success' => false, 'message' => 'Section is already free']);
        }

        $affected = DB::table($table)
            ->where('id', $sectionId)
            ->where('occupied_by', $row->occupied_by)
            ->update([
                'occupied_by' => null,
                'status' => 0,
                'updated_at' => DB::raw(config('queue.manila_now')),
            ]);

        if ($affected !== 1) {
            return response()->json(['success' => false, 'message' => 'Failed to release section']);
        }

        $emit->queueUpdated($map[$type]['dept']);

        return response()->json([
            'success' => true,
            'message' => $row->section_name.' released',
            'section' => $row->section_name,
        ]);
    }

    public function control()
    {
        if (empty(Session::get('is_superadmin', false))) {
            return redirect('index.php');
        }

        return view('sections.control');
    }
}
