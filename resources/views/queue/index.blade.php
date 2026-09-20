<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="csrf-token" content="{{ csrf_token() }}">
  <title>RHU Queue Admin</title>
  <script src="https://cdn.socket.io/4.5.4/socket.io.min.js"></script>
  <script type="module" src="/dist/assets/app-D1tVJTnW.js"></script>
  @inlineCss('dist/assets/module-CdqakSoB.css')
  @inlineCss('css/rhu-uniform.css')
  @inlineCss('css/controller-redesign.css')
  <script src="/js/notify.js"></script>
</head>
<body class="page-controller min-h-screen">
  <div class="ctrl-bg" aria-hidden="true"><span class="ctrl-ring ring-a"></span><span class="ctrl-ring ring-b"></span><span class="ctrl-line line-a"></span></div>
  <div id="sidebar-container"></div>

  <main class="ctrl-main">
    <div class="ctrl-wrap">
      <header class="ctrl-topbar">
        <div class="ctrl-titleblock">
          <p class="ctrl-eyebrow">RHU Operations &middot; Live</p>
          <h1 class="ctrl-title">QUEUE CONTROLLER</h1>
        </div>
        <div class="ctrl-livepill"><span class="ctrl-dot"></span>System Online</div>
      </header>

      <section class="ctrl-panel">
        <div class="ctrl-meta">
          <div class="ctrl-dept">
            <span class="ctrl-label">Department</span>
            <strong id="dept-name" class="ctrl-deptname">{{ $deptName }}</strong>
            <div id="dept-server-line" class="ctrl-server" @if (empty($deptServer)) style="display:none" @endif>
              Person in charge: <strong>{{ $deptServer }}</strong>
            </div>
          </div>
          <div class="ctrl-window">
            <span class="ctrl-label">Window</span>
            <div id="window-badge-area">
              @if ($activeSectionTable !== null)
                @if ($activeWindow)
                  <span class="window-badge is-assigned">
                    Window: {{ $activeWindow }}
                    @if (session('is_superadmin', false))
                      (takeover)
                    @endif
                  </span>
                @else
                  <span class="window-badge is-empty">
                    No window assigned
                  </span>
                @endif
              @endif
            </div>
          </div>
        </div>

        <input type="hidden" id="department_id" value="{{ (int) session('department_id', 0) }}">
        <input type="hidden" id="user_id" value="{{ (int) session('user_id', 0) }}">
        <input type="hidden" id="wait_area_dept" value="{{ in_array((int) session('department_id', 0), [3, 15], true) ? '1' : '0' }}">
        <input type="hidden" id="admission_window" value="{{ $activeWindow ?? '' }}">
        <input type="hidden" id="is_superadmin" value="{{ !empty(session('is_superadmin', false)) ? '1' : '0' }}">

        @if (!empty(session('is_superadmin', false)))
        <div class="ctrl-takeover">
          <label class="ctrl-label">Take Over Department</label>
          <div class="ctrl-row">
            <select id="takeover-dept" class="ctrl-select">
              <option value="">-- Select department --</option>
              @foreach ($departments as $dept)
                <option value="{{ (int) $dept->id }}" @if ((int) session('department_id', 0) === (int) $dept->id) selected @endif>
                  {{ $dept->name }}
                </option>
              @endforeach
            </select>
            <button id="takeover-btn" class="ctrl-btn ctrl-btn-secondary">Switch</button>
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
                  <button id="window-set-btn" class="ctrl-btn ctrl-btn-secondary">Set Window</button>
                  @if (!empty(session('takeover_section_id')))
                    <button id="window-clear-btn" class="ctrl-btn ctrl-btn-ghost">Clear</button>
                  @endif
                </div>
              @endif
            </div>
          </div>
        </div>
        @endif

        <div class="ctrl-actions">
          <button onclick="serveNext()" id="serve" class="ctrl-btn ctrl-btn-primary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3"/></svg>
            Serve Next
          </button>
          <button onclick="repeatCall()" id="recall" class="ctrl-btn ctrl-btn-ghost">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
            Repeat Call
          </button>
          <button onclick="openModal()" id="transfer-btn" class="ctrl-btn ctrl-btn-outline">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
            Transfer to Others
          </button>
          <span id="prioritize-btn-wrap" @if (strtoupper(trim($deptName)) !== 'LABORATORY') style="display:none" @endif>
            <button onclick="openPrioritizeModal()" class="ctrl-btn ctrl-btn-outline">
              Returning Patient
            </button>
          </span>
        </div>

        <div class="ctrl-tablewrap">
        <table class="controller-table">
          <thead>
            <tr>
              <th>Queue #</th>
              <th>Status</th>
              <th>Type</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="queue-body">
            <tr><td colspan="4" class="ctrl-empty">Loading queue&hellip;</td></tr>
          </tbody>
        </table>
        </div>

        @if ($inPoolClinic)
        <div class="ctrl-pool">
          <div class="ctrl-pool-head">
            <span class="ctrl-eyebrow">Mutual Help</span>
            <h2 class="ctrl-pool-title">Other Clinics Waiting</h2>
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
        @endif
      </section>
    </div>
  </main>

  <!-- Approval Modal (Serve requires physician/admin sign-off) -->
  <div id="approvalModal" class="fixed inset-0 z-50 hidden items-center justify-center bg-[#04122B]/60 p-4">
    <div class="ctrl-modal">
      <h3 class="ctrl-modal-title">Physician / Admin Approval</h3>
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
  <div id="poolServeModal" class="fixed inset-0 z-50 hidden items-center justify-center bg-[#04122B]/60 p-4">
    <div class="ctrl-modal">
      <h3 class="ctrl-modal-title">Confirm Mutual Help Pull</h3>
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
  <div id="prioritizeModal" class="fixed inset-0 z-50 hidden items-center justify-center bg-[#04122B]/60 p-4">
    <div class="ctrl-modal">
      <h3 class="ctrl-modal-title">Returning Patient</h3>
      <p class="ctrl-modal-sub">Enter the return code printed on the ticket to re-queue the patient here as priority.</p>
      <input type="text" id="prioritizeInput" placeholder="Enter return code" class="ctrl-modal-input" oninput="this.value=this.value.toUpperCase()">
      <div id="prioritizeMessage" class="hidden mt-3 rounded-md p-2 font-semibold text-sm"></div>
      <div class="mt-4 flex gap-2 justify-center">
        <button onclick="closePrioritizeModal()" class="ctrl-btn ctrl-btn-ghost">CANCEL</button>
        <button onclick="prioritizeQueue()" class="ctrl-btn ctrl-btn-primary">PRIORITIZE</button>
      </div>
    </div>
  </div>

  <!-- Transfer Modal -->
  <div id="addQueueModal" class="fixed inset-0 z-50 hidden items-center justify-center bg-[#04122B]/60 p-4">
    <div class="ctrl-modal ctrl-modal-wide">
      <h3 class="ctrl-modal-title">Transfer to Department</h3>
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

  <script src="/js/refreshTable.js?v=20260922e"></script>
  <script src="/js/fetch-polyfill.js?v=20260910a"></script>
  <script src="/js/voice-parts.js?v=20260910a"></script>
  <script src="/js/tts-fallback.js?v=20260910a"></script>
  <script src="/js/index.js?v=20260922c" defer></script>
  <script src="/js/sidebar.js?v=20260917c" defer></script>

  <script>
  let socket = null;
  if (window.io) {
    socket = io(window._QUEUE_SOCKET_HOST || "http://localhost:3000", { transports: ['websocket'] });
  } else {
    console.warn("Socket.IO unavailable; live refresh disabled.");
  }

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
    msg.classList.remove('visible');

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
        msg.style.color = "red";
        msg.classList.add('visible');
      }
    } catch (error) {
      console.error('Fetch error:', error);
      msg.textContent = "An error occurred.";
      msg.style.color = "red";
      msg.classList.add('visible');
    }
  }

  function openPrioritizeModal() {
    document.getElementById('prioritizeModal').style.display = 'flex';
    document.getElementById('prioritizeInput').value = '';
    const msg = document.getElementById('prioritizeMessage');
    msg.style.display = 'none';
    msg.textContent = '';
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

    if (!queueNumber) {
      msg.textContent = 'Please enter a queue number.';
      msg.style.color = 'red';
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
        msg.style.color = 'green';
        msg.style.display = 'block';
        input.value = '';

        if (typeof refreshTable === 'function') refreshTable();
      } else {
        msg.textContent = result.message || 'Failed to prioritize queue.';
        msg.style.color = 'red';
        msg.style.display = 'block';
      }
    } catch (error) {
      console.error('Prioritize error:', error);
      msg.textContent = 'An error occurred.';
      msg.style.color = 'red';
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
      '<button id="window-set-btn" class="ctrl-btn ctrl-btn-secondary">Set Window</button>' +
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
    const nameEl = document.getElementById('dept-name');
    if (nameEl) nameEl.textContent = r.department_name;
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

  // Listen for socket events AFTER initialization
  if (socket) {
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

  window.onclick = function(event) {
    const transferModal = document.getElementById('addQueueModal');
    if (event.target === transferModal) closeModal();
    const prioritizeModal = document.getElementById('prioritizeModal');
    if (event.target === prioritizeModal) closePrioritizeModal();
    const approvalModal = document.getElementById('approvalModal');
    if (event.target === approvalModal) closeApprovalModal();
    const poolServeModal = document.getElementById('poolServeModal');
    if (event.target === poolServeModal) closePoolServeModal();
  };

  </script>

  @if ($showChangePw)
  <div class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-[fadeIn_.3s_ease_forwards]" id="changePwModal">
    <div class="w-[340px] max-w-[90vw] rounded-2xl bg-white/95 p-7 text-center shadow-2xl transform translate-y-5 animate-[slideUp_.35s_ease_forwards]">
      <h3 class="text-lg font-semibold text-gray-900 mb-2">Change Your Password?</h3>
      <p class="text-sm text-gray-600 mb-5">You're still using the default password <strong>12345</strong>.<br>
      For your security, it's best to change it now.</p>
      <button class="rounded-xl bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 text-sm font-medium transition mx-1" id="changeNowBtn">Change Password</button>
      <button class="rounded-xl bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 text-sm font-medium transition mx-1" id="skipChangeBtn">Not Now</button>
    </div>
  </div>
  @endif

  <style>
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes slideUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
  </style>

  <script>
  document.addEventListener("DOMContentLoaded", () => {
    const changeBtn = document.getElementById("changeNowBtn");
    const skipBtn = document.getElementById("skipChangeBtn");

    if (changeBtn) {
      changeBtn.addEventListener("click", async () => {
        const newPassword = prompt("Enter your new password:");
        if (!newPassword || newPassword.trim().length < 5) {
          if (window.Notify && typeof Notify.toast === 'function') {
            Notify.toast('Password must be at least 5 characters long.', 'error');
          } else {
            alert('Password must be at least 5 characters long.');
          }
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
            const msg = data.message || 'Error changing password.';
            if (window.Notify && typeof Notify.toast === 'function') {
              Notify.toast(msg, 'error');
            } else {
              alert('Error: ' + msg);
            }
          }
        } catch (err) {
          if (window.Notify && typeof Notify.toast === 'function') {
            Notify.toast('An error occurred while changing password.', 'error');
          } else {
            alert('An error occurred.');
          }
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

</body>
</html>