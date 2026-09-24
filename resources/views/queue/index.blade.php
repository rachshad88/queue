<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="csrf-token" content="{{ csrf_token() }}">
  <title>Queue Controller — {{ $deptName ?: $username }}</title>
  <script src="/js/socket.io.min.js" defer></script>
  <style>@layer ctrl-overrides;</style>
  @inlineCss('dist/assets/module-CdqakSoB.css')
  @inlineCss('css/rhu-uniform.css')
  @inlineCss('css/controller-redesign.css')
  <script src="/js/notify.js?v=20260922g"></script>
</head>
<body class="page-controller min-h-screen">
  <x-hospital-background />
  <div id="sidebar-container"></div>

  <main class="ctrl-main">
    <div class="ctrl-wrap">

      <div class="qlayout">

        <input type="hidden" id="department_id" value="{{ (int) session('department_id', 0) }}">
        <input type="hidden" id="user_id" value="{{ (int) session('user_id', 0) }}">
        <input type="hidden" id="wait_area_dept" value="{{ in_array((int) session('department_id', 0), [3, 15], true) ? '1' : '0' }}">
        <input type="hidden" id="admission_window" value="{{ $activeWindow ?? '' }}">
        <input type="hidden" id="is_superadmin" value="{{ !empty(session('is_superadmin', false)) ? '1' : '0' }}">

        @if (!empty(session('is_superadmin', false)))
        <section class="qcard qcard-admin" aria-label="Administration">
          <div class="qcard-head">
            <span class="qcard-icon qcard-icon-navy"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></span>
            <div>
              <h2 class="qcard-title">Administration</h2>
              <p class="qcard-sub">Take over a department or manage windows</p>
            </div>
          </div>
          <div class="ctrl-takeover">
            <div class="ctrl-row">
              <label class="ctrl-label" for="takeover-dept">Take Over Department</label>
            </div>
            <div class="ctrl-row">
              <select id="takeover-dept" class="ctrl-select">
                <option value="">-- Select department --</option>
                @foreach ($departments as $dept)
                  <option value="{{ (int) $dept->id }}" @if ((int) session('department_id', 0) === (int) $dept->id) selected @endif>
                    {{ $dept->name }}
                  </option>
                @endforeach
              </select>
              <button id="takeover-btn" class="ctrl-btn ctrl-btn-primary">Switch</button>
            </div>

            <div id="dept-server-line" class="ctrl-server" @if (empty($deptServer)) style="display:none" @endif>
              Person in charge: <strong>{{ $deptServer }}</strong>
            </div>

            <div id="window-badge-area">
              @if ($activeSectionTable !== null)
                @if ($activeWindow)
                  <span class="window-badge is-assigned">Window: {{ $activeWindow }} (takeover)</span>
                @else
                  <span class="window-badge is-empty">No window assigned</span>
                @endif
              @endif
            </div>

            <div id="takeover-window-panel" class="ctrl-subpanel" @if ($activeSectionTable === null) style="display:none" @endif>
              <label id="takeover-window-label" class="ctrl-label">Window ({{ $deptName }})</label>
              <div id="takeover-window-body">
                @if (empty($takeoverSections))
                  <p class="ctrl-hint">No windows configured.</p>
                @else
                  <div class="ctrl-row">
                    <select id="takeover-section" class="ctrl-select">
                      <option value="">-- Select window --</option>
                      @foreach ($takeoverSections as $ts)
                        <option value="{{ (int) $ts->id }}" @if ((int) session('takeover_section_id', 0) === (int) $ts->id) selected @endif>
                          {{ $ts->section_name }}@if (!empty($ts->staff)) — {{ $ts->staff }}@endif
                        </option>
                      @endforeach
                    </select>
                    <button id="window-set-btn" class="ctrl-btn ctrl-btn-outline">Set Window</button>
                    @if (!empty(session('takeover_section_id')))
                      <button id="window-clear-btn" class="ctrl-btn ctrl-btn-ghost">Clear</button>
                    @endif
                  </div>
                @endif
              </div>
            </div>
          </div>
        </section>
        @endif

        <!-- ============ OPERATIONS CONSOLE (summary + actions, one card) ============ -->
        <section class="qcard qconsole" aria-label="Queue operations console">
        <div class="qconsole-top">
          <article class="qcard qserving qhero-serve" aria-live="polite">
            <div class="qchip qchip-teal"><span class="qdot qdot-pulse"></span>Now Serving</div>
            <div class="qserving-num" id="serve-num">&hellip;</div>
            <div class="qserving-meta">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              <span>Window <strong id="serve-window">—</strong></span>
              <span class="qserving-dept">{{ $deptName }}</span>
            </div>
          </article>

          <article class="qcard qnext qdock-next" aria-live="polite">
            <span class="qchip qchip-blue">Next Up</span>
            <div class="qnext-num" id="next-up">&hellip;</div>
            <div class="qnext-type" id="next-up-type">Waiting</div>
            <button type="button" class="qnext-go" onclick="serveNext()" title="Serve next patient" aria-label="Serve next patient">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3"/></svg>
            </button>
          </article>
        </div>

        <div class="qconsole-actions" role="group" aria-label="Call patient controls">
          <div class="qcall-grid">
            <button id="serve" onclick="serveNext()" class="qcallbtn qcallbtn-primary" aria-label="Serve Next" title="Serve Next — Call the next in line">
              <span class="qcallbtn-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3"/></svg></span>
              <span class="qcallbtn-t"><span class="qcallbtn-label">Serve Next</span><span class="qcallbtn-sub">Call the next in line</span></span>
            </button>
            <button id="recall" onclick="repeatCall()" class="qcallbtn" aria-label="Repeat Call" title="Repeat Call — Announce again">
              <span class="qcallbtn-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></span>
              <span class="qcallbtn-t"><span class="qcallbtn-label">Repeat Call</span><span class="qcallbtn-sub">Announce again</span></span>
            </button>
            <button id="transfer-btn" onclick="openModal()" class="qcallbtn" aria-label="Transfer to Others" title="Transfer to Others — Move patient to another clinic">
              <span class="qcallbtn-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg></span>
              <span class="qcallbtn-t"><span class="qcallbtn-label">Transfer to Others</span><span class="qcallbtn-sub">Move patient to another clinic</span></span>
            </button>
            <button id="hold-btn" onclick="holdCurrent()" class="qcallbtn" aria-label="Hold" title="Hold — Pause the current patient">
              <span class="qcallbtn-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg></span>
              <span class="qcallbtn-t"><span class="qcallbtn-label">Hold</span><span class="qcallbtn-sub">Pause the current patient</span></span>
            </button>
            <span id="prioritize-btn-wrap" @if (strtoupper(trim($deptName)) !== 'LABORATORY') style="display:none" @endif>
              <button onclick="openPrioritizeModal()" class="qcallbtn" aria-label="Returning Patient" title="Returning Patient — Re-queue as priority">
                <span class="qcallbtn-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></span>
                <span class="qcallbtn-t"><span class="qcallbtn-label">Returning Patient</span><span class="qcallbtn-sub">Re-queue as priority</span></span>
              </button>
            </span>
            <span id="serve-random-btn-wrap" @if (strtoupper(trim($deptName)) !== 'LABORATORY') style="display:none" @endif>
              <button id="serve-random" onclick="serveRandom()" class="qcallbtn" aria-label="Serve Random" title="Serve Random — Call a random patient">
                <span class="qcallbtn-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg></span>
                <span class="qcallbtn-t"><span class="qcallbtn-label">Serve Random</span><span class="qcallbtn-sub">Call a random patient</span></span>
              </button>
            </span>
          </div>
        </div>
        </section>

        <!-- ===================== PATIENT QUEUE ===================== -->
        <section class="qcard qqueue" aria-label="Patient queue">
          <div class="qqueue-head">
            <div class="qqueue-head-l">
              <span class="qcard-icon qcard-icon-mint"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span>
              <div>
                <h2 class="qcard-title">Patient Queue</h2>
                <p class="qcard-sub" id="queue-count">0 patients waiting</p>
              </div>
            </div>
            <div class="qtools">
              <select id="qfilter" class="qfilter-select" title="Filter queue" aria-label="Filter queue">
                <option value="all" selected>All</option>
                <option value="waiting">Waiting</option>
                <option value="hold">On Hold</option>
                <option value="priority">Priority</option>
              </select>
              <div class="qsearch-wrap">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="text" id="qsearch" class="qsearch" placeholder="Search queue number or type..." autocomplete="off">
              </div>
            </div>
          </div>

          <div class="ctrl-tablewrap qtablewrap">
            <table class="controller-table">
              <caption class="sr-only">Active queue &mdash; {{ $deptName }}.</caption>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Queue</th>
                  <th>Date/Time</th>
                  <th>Status</th>
                  <th>Type</th>
                  <th>Wait Time</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody id="queue-body">
                <tr><td colspan="7" class="ctrl-empty">Loading queue&hellip;</td></tr>
              </tbody>
            </table>
          </div>
          <div class="q-pagination" id="q-pagination">
            <div class="q-page-left">
              <span class="q-page-info" id="q-page-info">Loading&hellip;</span>
              <span class="q-fetch-time" id="q-fetch-time">Fetched &mdash;</span>
            </div>
            <div class="q-page-ctrls">
              <button type="button" id="q-prev-btn" class="q-page-btn" disabled>&laquo; Prev</button>
              <span class="q-page-input-wrap">
                <input type="number" id="q-page-input" class="q-page-input" min="1" value="1" aria-label="Page number">
                <span class="q-page-total" id="q-page-total">of 1</span>
              </span>
              <button type="button" id="q-next-btn" class="q-page-btn" disabled>Next &raquo;</button>
            </div>
          </div>
        </section>

        @if ($inPoolClinic)
        <section class="qcard qpool" aria-label="Mutual help">
          <div class="qcard-head">
            <span class="qcard-icon qcard-icon-blue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg></span>
            <div>
              <h2 class="qcard-title">Mutual Help</h2>
              <p class="qcard-sub">Other clinics waiting</p>
            </div>
          </div>
          <div class="ctrl-pool-wrap">
            <table class="controller-table" data-pool-ids="{{ implode(',', config('queue.pool_clinic_ids')) }}">
              <thead>
                <tr>
                  <th>Clinic</th>
                  <th>Queue #</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody id="pool-rows">
                <tr><td colspan="3" class="ctrl-empty">Loading&hellip;</td></tr>
              </tbody>
            </table>
            <p class="ctrl-hint">Serve your own queue first. When you have no waiting patients, take the next patient from another clinic here &mdash; the ticket moves to your clinic and is served immediately.</p>
          </div>
          </div>
        </section>
        @endif

      </div>
    </div>
  </main>

  <!-- Approval Modal (Serve requires physician/admin sign-off) -->
  <div id="approvalModal" class="fixed inset-0 z-50 hidden items-center justify-center bg-[#04122B]/60 p-4" role="dialog" aria-modal="true" aria-labelledby="approvalTitle">
    <div class="ctrl-modal">
      <h3 class="ctrl-modal-title" id="approvalTitle">Physician / Admin Approval</h3>
      <p class="ctrl-modal-sub">Serving a selected patient requires approval. Enter the password of a physician (CLINIC 1 / 2 / 3 / 4) or an admin.</p>
      <input type="password" id="approverPassword" placeholder="Approver password" class="ctrl-modal-input" autocomplete="off">
      <div id="approvalMessage" class="hidden mt-3 rounded-md p-2 font-semibold text-sm"></div>
      <div class="mt-4 flex gap-2 justify-center">
        <button onclick="closeApprovalModal()" class="ctrl-btn ctrl-btn-ghost">CANCEL</button>
        <button onclick="submitApproval()" class="ctrl-btn ctrl-btn-primary">APPROVE &amp; SERVE</button>
      </div>
    </div>
  </div>

  <!-- Pool Serve Password Modal (Clinic 1/2/3 mutual help pull) -->
  <div id="poolServeModal" class="fixed inset-0 z-50 hidden items-center justify-center bg-[#04122B]/60 p-4" role="dialog" aria-modal="true" aria-labelledby="poolServeTitle">
    <div class="ctrl-modal">
      <h3 class="ctrl-modal-title" id="poolServeTitle">Confirm Mutual Help Pull</h3>
      <p class="ctrl-modal-sub">Enter your password to pull this patient from the other clinic. You can only serve one patient at a time.</p>
      <input type="password" id="poolServePassword" placeholder="Your password" class="ctrl-modal-input" autocomplete="off">
      <div id="poolServeMessage" class="hidden mt-3 rounded-md p-2 font-semibold text-sm"></div>
      <div class="mt-4 flex gap-2 justify-center">
        <button onclick="closePoolServeModal()" class="ctrl-btn ctrl-btn-ghost">CANCEL</button>
        <button onclick="submitPoolServe()" class="ctrl-btn ctrl-btn-primary">SERVE</button>
      </div>
    </div>
  </div>

  <!-- Prioritize Modal -->
  <div id="prioritizeModal" class="fixed inset-0 z-50 hidden items-center justify-center bg-[#04122B]/60 p-4" role="dialog" aria-modal="true" aria-labelledby="prioritizeTitle">
    <div class="ctrl-modal">
      <h3 class="ctrl-modal-title" id="prioritizeTitle">Returning Patient</h3>
      <p class="ctrl-modal-sub">Enter the return code printed on the ticket to re-queue the patient here as priority.</p>
      <input type="text" id="prioritizeInput" placeholder="Enter return code" class="ctrl-modal-input" oninput="this.value=this.value.toUpperCase()">
      <div id="prioritizeMessage" class="hidden mt-3 rounded-md p-2 font-semibold text-sm"></div>
      <div class="mt-4 flex gap-2 justify-center">
        <button onclick="closePrioritizeModal()" class="ctrl-btn ctrl-btn-ghost">CANCEL</button>
        <button onclick="prioritizeQueue()" class="ctrl-btn ctrl-btn-primary">PRIORITIZE</button>
      </div>
    </div>
  </div>

  <!-- Transfer Modal -->  <div id="addQueueModal" class="fixed inset-0 z-50 hidden items-center justify-center bg-[#04122B]/60 p-4" role="dialog" aria-modal="true" aria-labelledby="transferTitle">
    <div class="ctrl-modal ctrl-modal-wide">
      <h3 class="ctrl-modal-title" id="transferTitle">Transfer to Department</h3>
      <div id="transfer-dept-list" class="mt-4 space-y-2">
        @if ($departments->isEmpty())
          <p class="ctrl-hint">No other departments available.</p>
        @else
          @foreach ($departments as $dept)
            <button onclick="transferToOther({{ (int) $dept->id }})" class="ctrl-transferbtn">
              {{ $dept->name }}
              @if (!empty($dept->server))
                <span class="ctrl-transfer-sub">{{ $dept->server }}</span>
              @endif
            </button>
          @endforeach
        @endif
      </div>
      <div id="modalMessage"></div>
      <button onclick="closeModal()" class="mt-4 ctrl-btn ctrl-btn-ghost">CANCEL</button>
    </div>
  </div>

  <script>
    window._QUEUE_SOCKET_HOST = window.location.origin;
  </script>
  @php
    $reverbHost = config('reverb.apps.apps.0.options.host');
    $reverbConfig = [
        'key' => config('reverb.apps.apps.0.key'),
        'host' => in_array($reverbHost, ['localhost', '127.0.0.1', null], true) ? null : $reverbHost,
        'port' => (int) config('reverb.apps.apps.0.options.port', 8080),
        'scheme' => config('reverb.apps.apps.0.options.scheme', 'http'),
        'deptId' => (int) session('department_id', 0) ?: null,
        'csrfToken' => csrf_token(),
    ];
  @endphp
  <script>
    window._REVERB = @json($reverbConfig);
  </script>
  <script src="/js/pusher.min.js" defer></script>
  <script src="/js/echo.iife.js" defer></script>
  <script src="/js/reverb.js?v=20260922a" defer></script>

  <script src="/js/refreshTable.js?v=20260923b"></script>
  <script src="/js/fetch-polyfill.js?v=20260910a"></script>
  <script src="/js/voice-parts.js?v=20260910a"></script>
  <script src="/js/tts-fallback.js?v=20260910a"></script>
  <script src="/js/index.js?v=20260922f" defer></script>
  <script src="/js/sidebar.js?v=20260923a" defer></script>

  <script>
  // Deferred socket.io (vendored) executes after parsing, so connect on
  // DOMContentLoaded when window.io is guaranteed to exist if it loaded.
  let socket = null;
  function initQueueSocket() {
    if (socket || !window.io) {
      if (!window.io) console.warn("Socket.IO unavailable; live refresh disabled.");
      return;
    }
    socket = io(window._QUEUE_SOCKET_HOST || "http://localhost:3000", { transports: ['websocket'] });
    // Listen for socket events AFTER initialization
    socket.on("queue-updated", (data) => {
      const currentDept = document.getElementById("department_id").value;
      if (parseInt(data.dept) === parseInt(currentDept)) {
        console.log("Queue updated for this department, refreshing...");
        refreshQueue();
      } else {
        console.log("Update for another department (" + data.dept + "), ignoring.");
      }
    });
  }
  document.addEventListener("DOMContentLoaded", initQueueSocket);

  function openModal() {
    document.getElementById('addQueueModal').style.display = 'flex';
  }

  function closeModal() {
    document.getElementById('addQueueModal').style.display = 'none';
    const msg = document.getElementById('modalMessage');
    msg.textContent = "";
    msg.classList.remove('visible');
  }

  async function transferToOther(deptId) {
    const msg = document.getElementById('modalMessage');
    msg.textContent = "";
    msg.classList.remove('visible', 'ctrl-msg-ok', 'ctrl-msg-err');

    if (!deptId) return;

    try {
      const formData = new FormData();
      formData.append('department_id', deptId);
      const csrfT = document.querySelector('meta[name="csrf-token"]')?.content || '';
      if (csrfT) formData.append('csrf_token', csrfT);

      const response = await fetch('transfer_queue.php', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();
      console.log(result);

      if (result.success) {
        closeModal();

        if (typeof refreshTable === 'function') refreshTable();

      } else {
        msg.textContent = result.message || "Failed to transfer.";
        msg.classList.add('visible', 'ctrl-msg-err');
      }
    } catch (error) {
      console.error('Fetch error:', error);
      msg.textContent = "An error occurred.";
      msg.classList.add('visible', 'ctrl-msg-err');
    }
  }

  function openPrioritizeModal() {
    document.getElementById('prioritizeModal').style.display = 'flex';
    document.getElementById('prioritizeInput').value = '';
    const msg = document.getElementById('prioritizeMessage');
    msg.style.display = 'none';
    msg.textContent = '';
    msg.classList.remove('ctrl-msg-ok', 'ctrl-msg-err');
    document.getElementById('prioritizeInput').focus();
  }

  function closePrioritizeModal() {
    document.getElementById('prioritizeModal').style.display = 'none';
  }

  async function prioritizeQueue() {
    const input = document.getElementById('prioritizeInput');
    const msg = document.getElementById('prioritizeMessage');
    const queueNumber = input.value.trim().toUpperCase();

    msg.style.display = 'none';
    msg.textContent = '';
    msg.classList.remove('ctrl-msg-ok', 'ctrl-msg-err');

    if (!queueNumber) {
      msg.textContent = 'Please enter a queue number.';
      msg.classList.add('ctrl-msg-err');
      msg.style.display = 'block';
      input.focus();
      return;
    }

    try {
      const formData = new FormData();
      formData.append('queue_number', queueNumber);
      const csrfT = document.querySelector('meta[name="csrf-token"]')?.content || '';
      if (csrfT) formData.append('csrf_token', csrfT);

      const response = await fetch('prioritize_queue.php', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (result.success) {
        msg.textContent = result.message;
        msg.classList.add('ctrl-msg-ok');
        msg.style.display = 'block';
        input.value = '';

        if (typeof refreshTable === 'function') refreshTable();
      } else {
        msg.textContent = result.message || 'Failed to prioritize queue.';
        msg.classList.add('ctrl-msg-err');
        msg.style.display = 'block';
      }
    } catch (error) {
      console.error('Prioritize error:', error);
      msg.textContent = 'An error occurred.';
      msg.classList.add('ctrl-msg-err');
      msg.style.display = 'block';
    }
  }

  function refreshQueue() {
    if (typeof refreshTable === 'function') {
      refreshTable();
    } else {
      console.warn("refreshTable() not found!");
    }
  }

  function takeOverDepartment() {
    const sel = document.getElementById('takeover-dept');
    const btn = document.getElementById('takeover-btn');
    if (!sel || !sel.value) return Notify.toast("Please select a department.", "error");
    return postTakeover(sel.value, '', btn, "Switching...");
  }

  function setTakeoverWindow() {
    const sel = document.getElementById('takeover-section');
    const btn = document.getElementById('window-set-btn');
    const dep = document.getElementById('department_id')?.value;
    if (!sel || !sel.value) return Notify.toast("Please select a window.", "error");
    if (!dep) return Notify.toast("No department selected.", "error");
    return postTakeover(dep, sel.value, btn, "Setting...");
  }

  function clearTakeoverWindow() {
    const btn = document.getElementById('window-clear-btn');
    const dep = document.getElementById('department_id')?.value;
    if (!dep) return Notify.toast("No department selected.", "error");
    return postTakeover(dep, '', btn, "Clearing...");
  }

  async function postTakeover(deptId, sectionId, btn, busyText) {
    if (!btn) return;
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = busyText;
    try {
      const formData = new FormData();
      formData.append('department_id', deptId);
      if (sectionId) formData.append('section_id', sectionId);
      const csrfT = document.querySelector('meta[name="csrf-token"]')?.content || '';
      if (csrfT) formData.append('csrf_token', csrfT);
      const response = await fetch('switch_department.php', { method: 'POST', body: formData });
      const result = await response.json();
      if (result.success) {
        let msg = "Now managing: " + result.department_name;
        if (result.section_name) msg += " (" + result.section_name + ")";
        Notify.toast(msg, "success");
        applyTakeoverResult(result);
      } else {
        Notify.toast(result.message || "Failed.", "error");
      }
    } catch (e) {
      console.error(e);
      Notify.toast("Error while switching.", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  // In-place update of all session-derived UI after a takeover switch
  function escapeHTML(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function takeoverWindowBindings() {
    const wSet = document.getElementById('window-set-btn');
    if (wSet && typeof setTakeoverWindow === 'function') wSet.addEventListener('click', setTakeoverWindow);
    const wClear = document.getElementById('window-clear-btn');
    if (wClear && typeof clearTakeoverWindow === 'function') wClear.addEventListener('click', clearTakeoverWindow);
  }

  function rebuildTakeoverWindowPanel(r) {
    const panel = document.getElementById('takeover-window-panel');
    if (!panel) return;
    const label = document.getElementById('takeover-window-label');
    if (label) label.innerHTML = 'Window (' + escapeHTML(r.department_name) + '):';
    if (!r.sectioned) {
      panel.style.display = 'none';
      return;
    }
    panel.style.display = '';
    const body = document.getElementById('takeover-window-body');
    if (!body) return;
    const sections = r.sections || [];
    if (!sections.length) {
      body.innerHTML = '<p class="text-xs text-gray-500 mt-1">No windows configured.</p>';
      return;
    }
    let opts = '<option value="">-- Select window --</option>';
    sections.forEach(s => {
      const staff = s.staff ? ' — ' + escapeHTML(s.staff) : '';
      const sel = String(s.id) === String(r.takeover_section_id) ? ' selected' : '';
      opts += '<option value="' + escapeHTML(s.id) + '"' + sel + '>' + escapeHTML(s.section_name) + staff + '</option>';
    });
    const clearBtn = r.takeover_section_id
      ? '<button id="window-clear-btn" class="ctrl-btn ctrl-btn-ghost">Clear</button>'
      : '';
    body.innerHTML =
      '<div class="ctrl-row">' +
      '<select id="takeover-section" class="ctrl-select">' + opts + '</select>' +
      '<button id="window-set-btn" class="ctrl-btn ctrl-btn-outline">Set Window</button>' +
      clearBtn +
      '</div>';
    takeoverWindowBindings();
  }

  function rebuildTransferModal(excludeId) {
    const list = document.getElementById('transfer-dept-list');
    if (!list) return;
    fetch('get_departments.php')
      .then(r => r.json())
      .then(arr => {
        if (!Array.isArray(arr)) return;
        const depts = (arr || []).filter(d => String(d.id) !== String(excludeId));
        if (!depts.length) {
          list.innerHTML = '<p class="text-sm text-gray-500">No other departments available.</p>';
          return;
        }
        list.innerHTML = depts.map(d =>
          '<button onclick="transferToOther(' + escapeHTML(d.id) + ')" class="ctrl-transferbtn">' +
          escapeHTML(d.name) +
          (d.server ? '<span class="ctrl-transfer-sub">' + escapeHTML(d.server) + '</span>' : '') +
          '</button>'
        ).join('');
      })
      .catch(() => {});
  }

  function applyTakeoverResult(r) {
    const depInput = document.getElementById('department_id');
    if (depInput) depInput.value = r.department_id;

    const srvLine = document.getElementById('dept-server-line');
    if (srvLine) {
      if (r.server) {
        srvLine.style.display = '';
        srvLine.innerHTML = 'Person in charge: <strong>' + escapeHTML(r.server) + '</strong>';
      } else {
        srvLine.style.display = 'none';
      }
    }

    const adm = document.getElementById('admission_window');
    if (adm) adm.value = r.active_window || '';

    const badgeArea = document.getElementById('window-badge-area');
    if (badgeArea) {
      if (r.sectioned) {
        if (r.active_window) {
          badgeArea.innerHTML = '<span class="window-badge is-assigned">Window: ' + escapeHTML(r.active_window) + ' (takeover)</span>';
        } else {
          badgeArea.innerHTML = '<span class="window-badge is-empty">No window assigned</span>';
        }
      } else {
        badgeArea.innerHTML = '';
      }
    }

    const labWrap = document.getElementById('prioritize-btn-wrap');
    if (labWrap) labWrap.style.display = String(r.department_name || '').toUpperCase().trim() === 'LABORATORY' ? '' : 'none';
    const randomWrap = document.getElementById('serve-random-btn-wrap');
    if (randomWrap) randomWrap.style.display = String(r.department_name || '').toUpperCase().trim() === 'LABORATORY' ? '' : 'none';

    const deptSel = document.getElementById('takeover-dept');
    if (deptSel) deptSel.value = String(r.department_id);

    rebuildTakeoverWindowPanel(r);
    rebuildTransferModal(r.department_id);

    if (typeof setCurrentDept === 'function') setCurrentDept(r.department_id);
    else if (typeof refreshTable === 'function') refreshTable();
  }

  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById('takeover-btn');
    if (btn) btn.addEventListener('click', takeOverDepartment);
    const wSet = document.getElementById('window-set-btn');
    if (wSet) wSet.addEventListener('click', setTakeoverWindow);
    const wClear = document.getElementById('window-clear-btn');
    if (wClear) wClear.addEventListener('click', clearTakeoverWindow);
  });

  document.addEventListener("click", function (event) {
    const transferModal = document.getElementById('addQueueModal');
    if (event.target === transferModal) closeModal();
    const prioritizeModal = document.getElementById('prioritizeModal');
    if (event.target === prioritizeModal) closePrioritizeModal();
    const approvalModal = document.getElementById('approvalModal');
    if (event.target === approvalModal) closeApprovalModal();
    const poolServeModal = document.getElementById('poolServeModal');
    if (event.target === poolServeModal) closePoolServeModal();
  });

  // Escape closes the topmost open modal.
  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    for (const id of ['changePwModal', 'poolServeModal', 'approvalModal', 'prioritizeModal', 'addQueueModal']) {
      const el = document.getElementById(id);
      if (el && (el.style.display === 'flex' || (id === 'changePwModal' && el.style.display !== 'none'))) {
        if (id === 'addQueueModal') closeModal();
        else if (id === 'prioritizeModal') closePrioritizeModal();
        else if (id === 'approvalModal') closeApprovalModal();
        else if (id === 'poolServeModal') closePoolServeModal();
        else el.style.display = 'none';
        break;
      }
    }
  });

  </script>

  @if ($showChangePw)
  <div class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-[fadeIn_.3s_ease_forwards]" id="changePwModal" role="dialog" aria-modal="true" aria-labelledby="changePwTitle">
    <div class="w-[340px] max-w-[90vw] rounded-2xl bg-white/95 p-7 text-center shadow-2xl transform translate-y-5 animate-[slideUp_.35s_ease_forwards]">
      <h3 class="text-lg font-semibold text-gray-900 mb-2" id="changePwTitle">Change Your Password?</h3>
      <p class="text-sm text-gray-600 mb-4">You're still using the default password <strong>12345</strong>.<br>
      For your security, it's best to change it now.</p>
      <input type="password" id="changePwNew" placeholder="New password (min 5 characters)" autocomplete="new-password"
             class="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 mb-2" />
      <input type="password" id="changePwConfirm" placeholder="Confirm new password" autocomplete="new-password"
             class="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200" />
      <label class="mt-2 flex items-center justify-center gap-2 text-xs text-gray-600">
        <input type="checkbox" id="changePwShow" class="h-4 w-4 accent-blue-600" /> Show passwords
      </label>
      <p id="changePwError" class="hidden mt-2 text-xs font-medium text-red-600"></p>
      <div class="mt-4">
        <button class="rounded-xl bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 text-sm font-medium transition mx-1" id="changeNowBtn">Save Password</button>
        <button class="rounded-xl bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 text-sm font-medium transition mx-1" id="skipChangeBtn">Not Now</button>
      </div>
    </div>
  </div>
  @endif

  <style>
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes slideUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
    @media (prefers-reduced-motion: reduce) {
      #changePwModal, #changePwModal > div { animation: none; transform: none; }
    }
  </style>

  <script>
  document.addEventListener("DOMContentLoaded", () => {
    const changeBtn = document.getElementById("changeNowBtn");
    const skipBtn = document.getElementById("skipChangeBtn");
    const newInput = document.getElementById("changePwNew");
    const confirmInput = document.getElementById("changePwConfirm");
    const showBox = document.getElementById("changePwShow");
    const errBox = document.getElementById("changePwError");

    function changePwError(msg) {
      if (errBox) {
        errBox.textContent = msg;
        errBox.classList.toggle("hidden", !msg);
      }
      if (msg) {
        if (window.Notify && typeof Notify.toast === 'function') {
          Notify.toast(msg, 'error');
        } else {
          alert(msg);
        }
      }
    }

    if (showBox && newInput && confirmInput) {
      showBox.addEventListener("change", () => {
        const type = showBox.checked ? "text" : "password";
        newInput.type = type;
        confirmInput.type = type;
      });
    }

    if (changeBtn) {
      changeBtn.addEventListener("click", async () => {
        const newPassword = (newInput?.value || "");
        const confirmPassword = (confirmInput?.value || "");
        if (!newPassword || newPassword.trim().length < 5) {
          changePwError('Password must be at least 5 characters long.');
          return;
        }
        if (newPassword !== confirmPassword) {
          changePwError('New password and confirmation do not match.');
          return;
        }

        try {
          const resp = await fetch("update_password.php", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: "new_password=" + encodeURIComponent(newPassword) +
              "&csrf_token=" + encodeURIComponent(csrfToken())
          });
          const data = await resp.json();
          if (data.success) {
            if (window.Notify && typeof Notify.toast === 'function') {
              Notify.toast('Password changed successfully!', 'success');
            } else {
              alert('Password changed successfully! Please remember your new password.');
            }
            document.getElementById("changePwModal").style.display = "none";
          } else {
            changePwError(data.message || 'Error changing password.');
          }
        } catch (err) {
          changePwError('An error occurred while changing password.');
        }
      });
    }

    if (skipBtn) {
      skipBtn.addEventListener("click", () => {
        document.getElementById("changePwModal").style.display = "none";
      });
    }
  });
  </script>

  <script src="/js/noinspect.js?v=20260922a" defer></script>
</body>
</html>