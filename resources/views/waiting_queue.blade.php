<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Queueing Ticket</title>
    @inlineCss('dist/assets/module-CdqakSoB.css')
    @inlineCss('css/rhu-uniform.css')
    <style>
        @keyframes kiosk-pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.015); }
        }
        .attracting .kiosk-band { animation: kiosk-pulse 2.2s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
            .attracting .kiosk-band { animation: none; }
        }
        /* Plain CSS (no build dependency) for the busy/stall notices. */
        .kiosk-notice {
            width: 100%; border-radius: 0.75rem; padding: 0.625rem 1rem;
            text-align: center; font-size: 0.875rem; font-weight: 700;
        }
        #kiosk-busy { border: 1px solid #bae6fd; background: #f0f9ff; color: #075985; }
        #kiosk-error { border: 1px solid #fecaca; background: #fef2f2; color: #b91c1c; }
    </style>
</head>
<body class="min-h-screen page-kiosk">
    <x-hospital-background />
    @if ($isLoggedIn)
    <div id="sidebar-container"></div>
    @endif

    <div class="relative z-[1] mx-auto flex min-h-screen w-full max-w-2xl flex-col px-4 py-4 sm:px-6" role="main">
        <header class="absolute inset-x-4 top-4 z-10 flex items-center justify-between gap-4 rounded-2xl border border-[#082A27] bg-gradient-to-b from-[#14524B] to-[#0E3B36] px-5 py-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,.22),inset_0_-2px_0_rgba(0,0,0,.25),0_10px_20px_rgba(8,42,39,.35)] sm:inset-x-6">
            <div class="flex items-center gap-4">
                <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 text-teal-100" aria-hidden="true">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/></svg>
                </span>
                <span>
                    <span class="block text-[11px] font-bold uppercase tracking-[0.22em] text-teal-200">Waiting Area Kiosk</span>
                    <span class="block text-xl font-extrabold tracking-tight text-white sm:text-2xl">Queueing Ticket</span>
                </span>
            </div>
            <p class="shrink-0 rounded-xl bg-black/25 px-3 py-1.5 text-right text-sm font-bold tabular-nums text-white" id="kiosk-clock" aria-label="Current time">&mdash;</p>
        </header>

        <main class="flex min-h-screen w-full flex-col justify-center gap-3 pb-20 pt-28">
            <div id="kiosk-attract" class="hidden rounded-2xl border border-teal-200 bg-teal-50 px-5 py-3 text-center text-base font-bold text-teal-800" role="status">
                Touch a ticket below to start
            </div>
            <div id="kiosk-busy" class="kiosk-notice hidden" role="status" aria-live="polite">
                Issuing your ticket&hellip; please wait.
            </div>
            <div id="kiosk-error" class="kiosk-notice hidden" role="alert">
                Couldn&rsquo;t reach the server &mdash; buttons are active again, please tap a ticket once more.
            </div>

            @if ($fromAdmission)
            <div class="w-full rounded-xl border border-sky-200 bg-sky-50 p-4 text-center text-sm font-medium text-sky-700">
              Admission ticketing has moved here — please take your ticket below.
            </div>
            @endif
            <form method="POST" class="flex">
                @csrf
                <input type="hidden" name="category" value="regular">
                <button type="submit" name="take_ticket" value="1" aria-label="Take a Regular ticket. General consultation lane."
                        class="kiosk-band flex min-h-[140px] w-full items-center gap-4 rounded-2xl border border-[#1d4ed8] bg-gradient-to-b from-[#2f6ff0] to-[#1d4ed8] px-5 py-4 text-left text-white shadow-[inset_0_1px_0_rgba(255,255,255,.25),inset_0_-2px_0_rgba(0,0,0,.14),0_8px_16px_rgba(37,99,235,.32)] transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:saturate-50">
                    <span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-white" aria-hidden="true">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/></svg>
                    </span>
                    <span>
                        <span class="block text-xl font-extrabold uppercase tracking-wide text-white">Regular</span>
                        <span class="mt-1 block text-sm text-blue-100">General consultation lane</span>
                    </span>
                </button>
            </form>

            <form method="POST" class="flex">
                @csrf
                <input type="hidden" name="category" value="priority">
                <button type="submit" name="take_ticket" value="1" aria-label="Take a Priority ticket. Seniors, PWD, pregnant, with infant."
                        class="kiosk-band flex min-h-[140px] w-full items-center gap-4 rounded-2xl border border-[#047857] bg-gradient-to-b from-[#34d399] to-[#059669] px-5 py-4 text-left text-white shadow-[inset_0_1px_0_rgba(255,255,255,.25),inset_0_-2px_0_rgba(0,0,0,.14),0_8px_16px_rgba(5,150,105,.32)] transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:saturate-50">
                    <span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-white" aria-hidden="true">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                    </span>
                    <span>
                        <span class="block text-xl font-extrabold uppercase tracking-wide text-white">Priority</span>
                        <span class="mt-1 block text-sm text-emerald-50">Seniors, PWD, pregnant, with infant</span>
                    </span>
                </button>
            </form>

            <form method="POST" class="flex">
                @csrf
                <input type="hidden" name="category" value="emergency">
                <button type="submit" name="take_ticket" value="1" aria-label="Take an Emergency ticket. Urgent medical need only."
                        class="kiosk-band flex min-h-[140px] w-full items-center gap-4 rounded-2xl border border-[#b91c1c] bg-gradient-to-b from-[#f87171] to-[#dc2626] px-5 py-4 text-left text-white shadow-[inset_0_1px_0_rgba(255,255,255,.25),inset_0_-2px_0_rgba(0,0,0,.14),0_8px_16px_rgba(220,38,38,.32)] transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300 focus-visible:ring-offset-2 active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:saturate-50">
                    <span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-white" aria-hidden="true">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    </span>
                    <span>
                        <span class="block text-xl font-extrabold uppercase tracking-wide text-white">Emergency</span>
                        <span class="mt-1 block text-sm text-red-50">Urgent medical need only</span>
                    </span>
                </button>
            </form>
        </main>

        <p class="absolute inset-x-4 bottom-4 py-3 text-center text-xs text-slate-500 sm:inset-x-6">Show your ticket number when called &middot; Keep your return code.</p>
    </div>

    @if ($isLoggedIn)
    <script src="/js/sidebar.js?v=20260923a" defer></script>
    @endif
  <script src="/js/noinspect.js?v=20260922a" defer></script>
  <script>
    // Manila clock for the kiosk header (decorative only).
    (function tickKioskClock() {
      function tick() {
        try {
          var manila = new Date(Date.now() + 8 * 3600 * 1000);
          var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          var p = function (n) { return String(n).padStart(2, '0'); };
          var hh = manila.getUTCHours(), ap = hh >= 12 ? 'PM' : 'AM';
          hh = hh % 12 || 12;
          var el = document.getElementById('kiosk-clock');
          if (el) el.textContent = months[manila.getUTCMonth()] + ' ' + manila.getUTCDate() + ', ' + manila.getUTCFullYear() + ' ' + hh + ':' + p(manila.getUTCMinutes()) + ' ' + ap;
        } catch (e) { /* clock is decorative */ }
      }
      tick();
      setInterval(tick, 1000);
    })();

    // Kiosk guard: a double-tap must never issue two tickets. The first
    // submit proceeds natively; repeats are swallowed. NEVER disable the
    // buttons inside the submit handler: the browser serializes the form
    // after the event dispatches, and a disabled submitter is dropped from
    // the POST body — take_ticket would vanish and the server would just
    // redirect back to the kiosk with no ticket issued. The pageshow reset
    // additionally re-arms the kiosk if the ticket page ever returns here
    // via back-forward cache instead of a fresh load.
    (function kioskGuard() {
      var sent = false;
      var stallTimer = null;
      function setNotice(showBusy, showError) {
        var busy = document.getElementById('kiosk-busy');
        var err = document.getElementById('kiosk-error');
        if (busy) busy.classList.toggle('hidden', !showBusy);
        if (err) err.classList.toggle('hidden', !showError);
      }
      window.addEventListener('pagehide', function () { if (stallTimer) clearTimeout(stallTimer); });
      window.addEventListener('pageshow', function () {
        sent = false;
        if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; }
        setNotice(false, false);
      });
      document.addEventListener('submit', function (e) {
        var form = e.target && e.target.closest ? e.target.closest('form') : null;
        if (!form || !form.querySelector('button[name="take_ticket"]')) return;
        if (sent) { e.preventDefault(); return; }
        sent = true;
        setNotice(true, false);
        if (stallTimer) clearTimeout(stallTimer);
        // Stall path: still on this page after 4s (no navigation); show an
        // explicit error and re-arm so the patient can retry.
        stallTimer = setTimeout(function () {
          sent = false;
          setNotice(false, true);
        }, 4000);
      });
      // Any tap clears a stale error notice before the new submit shows it.
      document.addEventListener('pointerdown', function () { setNotice(false, false); }, { passive: true });
    })();

    // Idle attract: after 60s without interaction, pulse the bands and show
    // the start banner; any activity clears it.
    (function attract() {
      var IDLE_MS = 60000, timer = null;
      var banner = document.getElementById('kiosk-attract');
      function clear() {
        document.body.classList.remove('attracting');
        if (banner) banner.classList.add('hidden');
        if (timer) { clearTimeout(timer); timer = null; }
      }
      function arm() {
        clear();
        timer = setTimeout(function () {
          document.body.classList.add('attracting');
          if (banner) banner.classList.remove('hidden');
        }, IDLE_MS);
      }
      ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
        document.addEventListener(ev, arm, { passive: true });
      });
      arm();
    })();
  </script>
</body>
</html>
