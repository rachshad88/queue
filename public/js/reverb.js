// Reverb realtime client (parallel to Socket.IO during migration).
//
// Config comes from window._REVERB set by the Blade page:
//   { key, host, port, scheme, deptId|null, csrfToken }
// - Anonymous pages (display walls): public `queue-display` channel.
// - Operator pages (deptId set): private `dept.{id}` channel (session-authed
//   via /broadcasting/auth). Private subscribers skip the public channel so
//   one event never triggers two refreshes.
// Socket.IO stays the primary transport until cutover; this only ADDS
// listeners, so a down Reverb server changes nothing.
(function () {
  function cfg() {
    return (typeof window._REVERB === 'object' && window._REVERB) || null;
  }

  function currentDept() {
    const el = document.getElementById('department_id');
    const v = el ? parseInt(el.value, 10) : NaN;
    return isNaN(v) ? null : v;
  }

  function handleQueueUpdated(data) {
    try {
      window.dispatchEvent(new CustomEvent('reverb-queue-updated', { detail: data || {} }));
    } catch (e) { /* listeners are optional */ }

    // Controller page: refresh when the event targets this department.
    if (typeof refreshTable === 'function') {
      const mine = currentDept();
      const dept = data && data.dept !== undefined ? parseInt(data.dept, 10) : NaN;
      if (mine === null || isNaN(dept) || dept === mine) {
        try { refreshTable(); } catch (e) { /* next poll covers it */ }
      }
    }
  }

  function handleRepeatCall(data) {
    try {
      window.dispatchEvent(new CustomEvent('reverb-repeat-call', { detail: data || {} }));
    } catch (e) { /* listeners are optional */ }
  }

  function boot() {
    const c = cfg();
    if (!c || !c.key || typeof Echo === 'undefined') return;

    let echo;
    try {
      echo = new Echo({
        broadcaster: 'reverb',
        key: c.key,
        wsHost: c.host || window.location.hostname,
        wsPort: c.port || 8080,
        wssPort: c.port || 8080,
        forceTLS: (c.scheme || 'http') === 'https',
        enabledTransports: ['ws', 'wss'],
        disableStats: true,
        authEndpoint: 'broadcasting/auth',
        auth: { params: c.csrfToken ? { csrf_token: c.csrfToken } : {} },
      });
    } catch (e) {
      return;
    }

    try {
      if (c.deptId) {
        echo.private('dept.' + c.deptId)
          .listen('.queue-updated', handleQueueUpdated)
          .listen('.repeat-call', handleRepeatCall);
      } else {
        echo.channel('queue-display')
          .listen('.queue-updated', handleQueueUpdated)
          .listen('.repeat-call', handleRepeatCall);
      }
    } catch (e) { /* stay on Socket.IO */ }

    window._reverbEcho = echo;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
