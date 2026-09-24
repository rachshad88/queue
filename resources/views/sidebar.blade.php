@php
    $deptUpper = strtoupper(trim($dept ?? ''));
    $showWaitingTicket = $isSuper || $deptUpper === 'WAITING AREA';
@endphp
{{-- Premium hospital sidebar (single variant for every page).
     Session-driven like before: $username/$dept/$usertype/$isSuper/$isCustomer/
     $initials/$currentPage come from SidebarController. Branding uses
     config('app.name'). Hooks kept for sidebar.js: #app-sidebar, .sidebar-link,
     #show-sidebar, .sidebar-backdrop, #change-password-*, logout POST form,
     #sb2-collapse, #sb2-close. Palette: deep forest green + lime/gold. --}}
<aside id="app-sidebar" class="sidebar-saas sb2" aria-label="Sidebar">
  <button type="button" id="sb2-close" class="sb2-close" aria-label="Close sidebar">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
  </button>

  <div class="sb2-head">
    <div class="sb2-brand">
      <span class="sb2-logo" aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/></svg>
      </span>
      <div class="sb2-brand-text">
        <p class="sb2-name">{{ config('app.name', 'RHU Queue') }}</p>
        <p class="sb2-tag">Better Care · Healthier Tomorrow</p>
      </div>
    </div>
    <button type="button" id="sb2-collapse" class="sb2-collapse" aria-label="Collapse sidebar" title="Collapse sidebar">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m11 17-5-5 5-5"/><path d="m18 17-5-5 5-5"/></svg>
    </button>
  </div>

  <div class="sb2-status" role="status">
    <span class="sb2-dot" aria-hidden="true"></span>
    <span class="sb2-status-lines">
      <span class="sb2-status-text">All systems operational</span>
      <span class="sb2-status-sub">RHU Queue Management System</span>
    </span>
  </div>

  @if ($isSuper && $dept)
  <div class="sb2-super">
    <div class="sb2-super-head"><span class="sb2-dot sb2-dot-live" aria-hidden="true"></span><span class="sb2-super-title">Takeover Active</span></div>
    <p class="sb2-super-dept">{{ $dept }}</p>
  </div>
  @endif

  <nav class="sb2-nav sidebar-nav" aria-label="Primary sidebar navigation">
    @if ($isCustomer)
      <div class="sb2-section">
        <p class="sb2-group">QUEUE</p>
        <ul class="sb2-list">
          @if ($deptUpper === 'WAITING AREA')
          <x-sb2-item href="waiting_queue.php" file="waiting_queue.php" :current="$currentPage" label="Queue Ticket">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/></svg>
          </x-sb2-item>
          @endif
          @if ($deptUpper === 'ABTC')
          <x-sb2-item href="abtc_queue.php" file="abtc_queue.php" :current="$currentPage" label="ABTC Queue">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
          </x-sb2-item>
          @endif
        </ul>
      </div>
    @else
      <div class="sb2-section">
        <p class="sb2-group">MAIN</p>
        <ul class="sb2-list">
          @if ($showWaitingTicket)
          <x-sb2-item href="waiting_queue.php" file="waiting_queue.php" :current="$currentPage" label="Queue Ticket">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/></svg>
          </x-sb2-item>
          @endif
          <x-sb2-item href="index.php" file="index.php" :current="$currentPage" label="Queue Controller">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>
          </x-sb2-item>
          @if ($deptUpper === 'ABTC')
          <x-sb2-item href="abtc_queue.php" file="abtc_queue.php" :current="$currentPage" label="ABTC Queue">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
          </x-sb2-item>
          @endif
          <x-sb2-item href="served_queues.php" file="served_queues.php" :current="$currentPage" label="Served Queues">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.801 10A10 10 0 1 1 17 3.335"/><path d="m9 11 3 3L22 4"/></svg>
          </x-sb2-item>
          <x-sb2-item href="server_history.php" file="server_history.php" :current="$currentPage" label="Queue History">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>
          </x-sb2-item>
          @if ($isSuper)
          <x-sb2-item href="queue_logs.php" file="queue_logs.php" :current="$currentPage" label="Queue Logs">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
          </x-sb2-item>
          @endif
        </ul>
      </div>

      <div class="sb2-section">
        <p class="sb2-group">SYSTEM</p>
        <ul class="sb2-list">
          @if ($usertype === 'admin')
          <x-sb2-item href="user_management.php" file="user_management.php" :current="$currentPage" label="User Management">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </x-sb2-item>
          <x-sb2-item href="department_management.php" file="department_management.php" :current="$currentPage" label="Department Mgmt">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/></svg>
          </x-sb2-item>
          @endif
          @if ($isSuper)
          <x-sb2-item href="section_control.php" file="section_control.php" :current="$currentPage" label="Section Control">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3"/><path d="M12 19v3"/><path d="M2 12h3"/><path d="M19 12h3"/><path d="m4.9 4.9 2.1 2.1"/><path d="m17 17 2.1 2.1"/><path d="m19.1 4.9-2.1 2.1"/><path d="m7 17-2.1 2.1"/></svg>
          </x-sb2-item>
          @endif
          @if (! $isCustomer && $usertype !== 'admin')
          <x-sb2-item href="edit_account.php" file="edit_account.php" :current="$currentPage" label="Edit Account">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 20a6 6 0 0 0-12 0"/><circle cx="12" cy="10" r="4"/><circle cx="12" cy="12" r="10"/></svg>
          </x-sb2-item>
          @endif
          <li>
            <button type="button" id="change-password-btn" class="sb2-link sb2-btn" aria-expanded="false" aria-controls="change-password-form" title="Change Password">
              <span class="sb2-ic" aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="16" r="1"/><rect x="3" y="10" width="18" height="12" rx="2"/><path d="M7 10V7a5 5 0 0 1 9.9-1"/></svg>
              </span>
              <span class="sb2-label">Change Password</span>
            </button>
          </li>
          <li>
            <form action="logout.php" method="post" class="sb2-nav-logout">
              <input type="hidden" name="_token" value="{{ csrf_token() }}">
              <button type="submit" class="sb2-link sb2-btn" title="Logout">
                <span class="sb2-ic" aria-hidden="true">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                </span>
                <span class="sb2-label">Logout</span>
              </button>
            </form>
          </li>
        </ul>
      </div>
    @endif
  </nav>

  <div class="sb2-pw">
    <form id="change-password-form" class="sb2-pw-form hidden" onsubmit="return false;">
      <input type="password" id="old-password" name="old_password" placeholder="Current password" class="sb2-input" autocomplete="current-password" />
      <input type="password" id="new-password" name="new_password" placeholder="New password" class="sb2-input" autocomplete="new-password" />
      <input type="password" id="confirm-password" name="confirm_password" placeholder="Confirm new password" class="sb2-input" autocomplete="new-password" />
      <div class="sb2-pw-actions">
        <button type="button" id="submit-change-password" class="sb2-pw-save">Save</button>
        <button type="button" id="cancel-change-password" class="sb2-pw-cancel">Cancel</button>
      </div>
      <div id="change-password-feedback" class="hidden sb2-pw-feedback"></div>
    </form>
  </div>

  <div class="sb2-foot">
    <div class="sb2-foot-card">
      <span class="sb2-avatar" aria-hidden="true">{{ $initials ?: '?' }}</span>
      <div class="sb2-foot-meta">
        <p class="sb2-uname">{{ $username ?: 'User' }}</p>
      </div>
      @if ($isCustomer)
      <form action="logout.php" method="post" class="sb2-logout-form">
        <input type="hidden" name="_token" value="{{ csrf_token() }}">
        <button type="submit" class="sb2-logout" title="Logout" aria-label="Logout">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>          <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        </button>
      </form>
      @endif
    </div>
    <div class="sb2-quality" aria-hidden="true">
      <span class="sb2-quality-ic">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><polyline points="3.5 12 7 12 9.5 9 12.5 15 14.5 12 20.5 12"/></svg>
      </span>
      <div class="sb2-quality-text">
        <p class="sb2-quality-title">Quality Care</p>
        <p class="sb2-quality-sub">for Every Patient</p>
      </div>
    </div>
    <p class="sb2-version">v1.0.0</p>
  </div>
</aside>

<button type="button" id="show-sidebar" aria-label="Open sidebar">
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>
</button>
