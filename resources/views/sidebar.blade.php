@php
    $deptUpper = strtoupper(trim($dept ?? ''));
    function isActive(string $file, string $current): bool { return $current === $file; }
    function navClass(string $file, string $current): string {
        if (isActive($file, $current)) {
            return 'sidebar-link flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white bg-sky-500/15 relative before:content-[""] before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-full before:bg-sky-400 transition-colors active:bg-sky-500/25 active:text-white active:scale-[0.99]';
        }
        return 'sidebar-link flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-colors active:bg-sky-500/25 active:text-white active:scale-[0.99]';
    }
    function navTileClass(): string { return 'nav-tile flex items-center justify-center w-8 h-8 rounded-lg shrink-0'; }
    function iconTileClass(string $file, string $current): string {
        if (isActive($file, $current)) return navTileClass() . ' bg-sky-600 text-white shadow-md shadow-sky-900/40';
        return navTileClass() . ' text-slate-500';
    }
    $showWaitingTicket = $isSuper || $deptUpper === 'WAITING AREA';
    $showManage = $usertype === 'admin' || $isSuper;
@endphp
<aside class="bg-[#071633] border-r border-sky-200/10 w-full h-full flex flex-col fixed top-0 left-0 z-40 max-w-[280px] py-5 overflow-auto sidebar-saas" id="app-sidebar" aria-label="Sidebar">

  <!-- Brand -->
  <div class="px-5 mb-2">
    <div class="flex items-center gap-3">
      <div class="flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-[#16479B] to-[#1E88D8] shadow-md shadow-sky-950/50 ring-1 ring-sky-300/20">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
      </div>
      <div>
        <p class="text-sm font-bold text-white tracking-tight leading-none">Queue System</p>
        <p class="text-[11px] text-sky-200/60 font-medium mt-0.5 tracking-wide">RHU Operations</p>
      </div>
    </div>
  </div>

  <!-- Superadmin context card -->
  @if ($isSuper && $dept)
    <div class="mx-4 mb-4 mt-3 rounded-lg bg-sky-500/10 border border-sky-300/20 px-3.5 py-2.5">
      <div class="flex items-center gap-2 mb-1">
        <span class="relative flex h-2 w-2 shrink-0">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
          <span class="relative inline-flex rounded-full h-2 w-2 bg-sky-400"></span>
        </span>
        <span class="text-[11px] font-semibold text-sky-300 uppercase tracking-wider">Takeover Active</span>
      </div>
      <p class="text-xs text-slate-200 font-medium">{{ $dept }}</p>
    </div>
  @endif

  <!-- Navigation -->
  <nav aria-label="Primary sidebar navigation" class="flex-1 px-3 space-y-6 overflow-y-auto sidebar-nav">
    @if ($isCustomer)
      <!-- Customer view: minimal links -->
      <div>
        <p class="px-3 mb-2 text-[11px] font-bold text-slate-600 uppercase tracking-wider">Queue</p>
        <ul class="space-y-0.5">
          @if ($deptUpper === 'WAITING AREA')
            <li>
              <a href="waiting_queue.php" class="{{ navClass('waiting_queue.php', $currentPage) }}" aria-current="{{ isActive('waiting_queue.php', $currentPage) ? 'page' : 'false' }}">
                <span class="{{ iconTileClass('waiting_queue.php', $currentPage) }}">
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                </span>
                Queue Ticket
              </a>
            </li>
          @endif
          @if ($deptUpper === 'ABTC')
            <li>
              <a href="abtc_queue.php" class="{{ navClass('abtc_queue.php', $currentPage) }}" aria-current="{{ isActive('abtc_queue.php', $currentPage) ? 'page' : 'false' }}">
                <span class="{{ iconTileClass('abtc_queue.php', $currentPage) }}">
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                </span>
                ABTC Queue
              </a>
            </li>
          @endif
        </ul>
      </div>
    @else
      <!-- Overview section -->
      <div>
        <p class="px-3 mb-2 text-[11px] font-bold text-slate-600 uppercase tracking-wider">Overview</p>
        <ul class="space-y-0.5">
          @if ($showWaitingTicket)
          <li>
            <a href="waiting_queue.php" class="{{ navClass('waiting_queue.php', $currentPage) }}" aria-current="{{ isActive('waiting_queue.php', $currentPage) ? 'page' : 'false' }}">
              <span class="{{ iconTileClass('waiting_queue.php', $currentPage) }}">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a3 3 0 0 0 0 6v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a3 3 0 0 0 0-6z"/><line x1="13" y1="5" x2="13" y2="7"/><line x1="13" y1="11" x2="13" y2="13"/><line x1="13" y1="17" x2="13" y2="19"/></svg>
              </span>
              Queue Ticket
            </a>
          </li>
          @endif

          <li>
            <a href="index.php" class="{{ navClass('index.php', $currentPage) }}" aria-current="{{ isActive('index.php', $currentPage) ? 'page' : 'false' }}">
              <span class="{{ iconTileClass('index.php', $currentPage) }}">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>
              </span>
              Queue Controller
            </a>
          </li>

          @if ($deptUpper === 'ABTC')
            <li>
              <a href="abtc_queue.php" class="{{ navClass('abtc_queue.php', $currentPage) }}" aria-current="{{ isActive('abtc_queue.php', $currentPage) ? 'page' : 'false' }}">
                <span class="{{ iconTileClass('abtc_queue.php', $currentPage) }}">
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                </span>
                ABTC Queue
              </a>
            </li>
          @endif
        </ul>
      </div>

      <!-- Logs section -->
      <div>
        <p class="px-3 mb-2 text-[11px] font-bold text-slate-600 uppercase tracking-wider">Logs</p>
        <ul class="space-y-0.5">
          <li>
            <a href="served_queues.php" class="{{ navClass('served_queues.php', $currentPage) }}" aria-current="{{ isActive('served_queues.php', $currentPage) ? 'page' : 'false' }}">
              <span class="{{ iconTileClass('served_queues.php', $currentPage) }}">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              </span>
              Served Queues
            </a>
          </li>

          <li>
            <a href="server_history.php" class="{{ navClass('server_history.php', $currentPage) }}" aria-current="{{ isActive('server_history.php', $currentPage) ? 'page' : 'false' }}">
              <span class="{{ iconTileClass('server_history.php', $currentPage) }}">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </span>
              Queue History
            </a>
          </li>

          @if ($isSuper)
          <li>
            <a href="queue_logs.php" class="{{ navClass('queue_logs.php', $currentPage) }}" aria-current="{{ isActive('queue_logs.php', $currentPage) ? 'page' : 'false' }}">
              <span class="{{ iconTileClass('queue_logs.php', $currentPage) }}">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
              </span>
              Queue Logs
            </a>
          </li>
          @endif
        </ul>
      </div>

      @if ($showManage)
      <!-- Manage section -->
      <div>
        <p class="px-3 mb-2 text-[11px] font-bold text-slate-600 uppercase tracking-wider">Manage</p>
        <ul class="space-y-0.5">
          @if ($usertype === 'admin')
            <li>
              <a href="user_management.php" class="{{ navClass('user_management.php', $currentPage) }}" aria-current="{{ isActive('user_management.php', $currentPage) ? 'page' : 'false' }}">
                <span class="{{ iconTileClass('user_management.php', $currentPage) }}">
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                </span>
                User Management
              </a>
            </li>
          @endif

          @if ($usertype === 'admin')
            <li>
              <a href="department_management.php" class="{{ navClass('department_management.php', $currentPage) }}" aria-current="{{ isActive('department_management.php', $currentPage) ? 'page' : 'false' }}">
                <span class="{{ iconTileClass('department_management.php', $currentPage) }}">
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                </span>
                Department Mgmt
              </a>
            </li>
          @endif

          @if ($isSuper)
            <li>
              <a href="section_control.php" class="{{ navClass('section_control.php', $currentPage) }}" aria-current="{{ isActive('section_control.php', $currentPage) ? 'page' : 'false' }}">
                <span class="{{ iconTileClass('section_control.php', $currentPage) }}">
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                </span>
                Section Control
              </a>
            </li>
          @endif
        </ul>
      </div>
      @endif

      <!-- Account section -->
      <div>
        <p class="px-3 mb-2 text-[11px] font-bold text-slate-600 uppercase tracking-wider">Account</p>
        <ul class="space-y-0.5">
          @if (! $isCustomer && $usertype !== 'admin')
            <li>
              <a href="edit_account.php" class="{{ navClass('edit_account.php', $currentPage) }}" aria-current="{{ isActive('edit_account.php', $currentPage) ? 'page' : 'false' }}">
                <span class="{{ iconTileClass('edit_account.php', $currentPage) }}">
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                </span>
                Edit Account
              </a>
            </li>
          @endif

          <li>
            <button type="button" id="change-password-btn" aria-expanded="false" class="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-colors active:bg-white/10 active:scale-[0.98] text-left">
              <span class="flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </span>
              Change Password
            </button>
          </li>
        </ul>
      </div>
    @endif
  </nav>

  <!-- Inline change password form (dark) -->
  <div class="px-4">
    <form id="change-password-form" class="hidden space-y-2.5 mt-2 rounded-lg bg-white/5 border border-sky-200/10 p-3.5" onsubmit="return false;">
      <input type="password" id="old-password" name="old_password" placeholder="Current password"
             class="w-full rounded-md border border-sky-200/10 bg-[#0A1F4D]/60 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400 transition" />
      <input type="password" id="new-password" name="new_password" placeholder="New password"
             class="w-full rounded-md border border-sky-200/10 bg-[#0A1F4D]/60 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400 transition" />
      <input type="password" id="confirm-password" name="confirm_password" placeholder="Confirm new password"
             class="w-full rounded-md border border-sky-200/10 bg-[#0A1F4D]/60 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400 transition" />
      <div class="flex gap-2">
        <button type="button" id="submit-change-password" class="flex-1 rounded-md bg-[#1B63C8] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#256FD6] active:bg-[#16479B] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">Save</button>
        <button type="button" id="cancel-change-password" class="flex-1 rounded-md bg-white/10 px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/15 active:bg-white/20 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500">Cancel</button>
      </div>
      <div id="change-password-feedback" class="hidden text-xs font-medium"></div>
    </form>
  </div>

  <!-- Profile + Logout footer -->
  <div class="px-3 pt-4 mt-auto">
    <div class="rounded-lg bg-white/[0.04] border border-sky-200/10 p-3">
      <div class="flex items-center gap-3">
        <div class="flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-br from-[#16479B] to-[#1E88D8] text-white text-xs font-bold shrink-0 ring-1 ring-sky-300/25">
          {{ $initials ?: '?' }}
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-semibold text-white truncate">{{ $username ?: 'User' }}</p>
          <p class="text-[11px] text-slate-500 truncate">{{ $dept ?: $usertype }}</p>
        </div>
        <form action="logout.php" method="post">
          <input type="hidden" name="_token" value="{{ csrf_token() }}">
          <button type="submit" class="flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors active:bg-red-500/20 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500" title="Logout">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </form>
      </div>
    </div>
  </div>

</aside>

<!-- Mobile hamburger (hidden on desktop) -->
<button type="button" id="show-sidebar"
  class="fixed left-3 top-3 z-50 lg:hidden flex items-center justify-center w-10 h-10 rounded-xl bg-slate-900 border border-white/10 text-white shadow-lg hover:bg-slate-800 transition active:bg-slate-700 active:scale-95">
  <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
</button>