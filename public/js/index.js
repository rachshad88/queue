// ========== Queue Management ==========

// XHR-based JSON call. Works on Android System WebView where fetch() may be
// missing — the Serve Next / Repeat Call sound path must never depend on fetch.
function csrfToken() {
  const m = document.querySelector('meta[name="csrf-token"]');
  return m ? (m.getAttribute('content') || '') : '';
}

function httpJson(method, url, body) {
  return new Promise(function (resolve, reject) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open(method, url, true);
      xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
      if (method.toUpperCase() === 'POST') {
        var token = csrfToken();
        if (token) {
          var sep = (body && body.length) ? '&' : '';
          body = (body || '') + sep + 'csrf_token=' + encodeURIComponent(token);
        }
        xhr.setRequestHeader('X-CSRF-Token', token);
      }
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText)); }
          catch (e) { reject(new Error('Invalid JSON response')); }
        } else {
          reject(new Error('HTTP ' + xhr.status));
        }
      };
      xhr.onerror = function () { reject(new Error('Network error')); };
      xhr.send(body || null);
    } catch (e) { reject(e); }
  });
}

let _pingCtx = null;
function getPingContext() {
  if (!_pingCtx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (Ctor) _pingCtx = new Ctor();
  }
  if (_pingCtx && _pingCtx.state === 'suspended') _pingCtx.resume();
  return _pingCtx;
}

// ---- Announcement audio (m4a -> MIME-corrected serve endpoint, WebView-safe) ----
let _annAudio = null;
let _annTry = 0;
let _annSrcs = ['sound/announcement.m4a', 'sound/serve.php?f=announcement.wav'];
function getAnnouncementAudio() {
  if (!_annAudio) {
    try {
      const a = new Audio();
      a.preload = 'auto';
      a.onerror = function () {
        _annTry++;
        if (_annTry < _annSrcs.length) {
          try { a.src = _annSrcs[_annTry]; a.load(); } catch (e) { /* ignore */ }
        }
      };
      a.src = _annSrcs[0];
      a.load();
      if (document.body) { try { document.body.appendChild(a); } catch (e) { /* ignore */ } }
      _annAudio = a;
    } catch (e) { /* audio element unavailable */ }
  }
  return _annAudio;
}

// Unlock audio on the first trusted gesture so later play() calls are allowed.
// Listens on many event types because Android TV remotes / WebViews may only
// deliver some of them (click, key, touch, pointer).
function unlockAnnouncementAudio() {
  try {
    const a = getAnnouncementAudio();
    if (a) {
      const p = a.play();
      if (p && p.then) p.then(() => { a.pause(); a.currentTime = 0; }).catch(() => {});
    }
  } catch (e) { /* ignore */ }
  try { const ctx = getPingContext(); if (ctx && ctx.resume) ctx.resume(); } catch (e2) { /* ignore */ }
}

let _retrying = false;
function retrySoundLater() {
  if (_retrying) return;
  _retrying = true;
  setTimeout(function () {
    _retrying = false;
    playAnnouncement();
  }, 4000);
}

// Synthesized three-note call chime. Returns true when a WebAudio path existed.
function playCallChime() {
  const ctx = getPingContext();
  if (!ctx) return false;
  try {
    const now = ctx.currentTime;
    [880, 941, 1046].forEach(function (freq, i) {
      const start = now + i * 0.22;
      const dur = 0.3;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.8, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
      osc.start(start);
      osc.stop(start + dur);
    });
    return true;
  } catch (e) { return false; }
}

function playAnnouncement() {
  try {
    const a = getAnnouncementAudio();
    if (a) {
      let retried = false;
      const retryOnce = function () {
        if (!retried) { retried = true; if (!playCallChime()) retrySoundLater(); }
      };
      a.onerror = retryOnce;
      a.currentTime = 0;
      const p = a.play();
      if (p && p.then) {
        p.then(() => { a.onerror = null; }).catch(retryOnce);
      } else if (p) {
        a.onerror = null;
      } else {
        retryOnce();
      }
    } else if (!playCallChime()) {
      retrySoundLater();
    }
  } catch (e) {
    if (!playCallChime()) retrySoundLater();
  }
}

// ---- TTS queue-number announcement ----
let lastServedNumber = null;
let lastServedDept = '';

function spellForTts(code) {
  return String(code || '')
    .split('')
    .map(function (ch) { return /[0-9A-Za-z]/.test(ch) ? ch.toUpperCase() : ''; })
    .filter(Boolean)
    .join(' ');
}

function speakText(text) {
  try {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 1.2;
    u.pitch = 1;
    u.volume = 1;
    window.speechSynthesis.speak(u);
  } catch (e) { /* tts not available */ }
}

function speakQueueNumber(number, deptName) {
  const dept = deptName ? String(deptName).trim() : '';
  let parts = ['now_serving'].concat(window.spellVoiceParts ? window.spellVoiceParts(number) : []);
  parts.push('please_proceed_to');
  if (window.deptVoiceParts) parts = parts.concat(window.deptVoiceParts(dept));
  const spelled = spellForTts(number);
  const text = 'Now serving ' + spelled + '. Please proceed to ' + (dept || 'your designated counter') + '.';
  if (window.playSpokenParts) {
    const played = window.playSpokenParts(parts, function () { speakText(text); });
    if (played) return;
  }
  speakText(text);
}

function getServedParts(number) {
  return ['now_serving', 'queue_number'].concat(window.spellVoiceParts ? window.spellVoiceParts(number) : []);
}

function announceServeNext(number) {
  lastServedNumber = number || null;
  playAnnouncement();
  setTimeout(function () {
    const spelled = spellForTts(number);
    const text = 'Now serving. Queue number ' + spelled + '.';
    let parts = getServedParts(number);
    if (window.playSpokenParts) {
      const played = window.playSpokenParts(parts, function () { speakText(text); });
      if (played) return;
    }
    speakText(text);
  }, 750);
}

function announceServed(number, deptName) {
  lastServedNumber = number || null;
  lastServedDept = deptName || '';
  playAnnouncement();
  setTimeout(function () {
    speakQueueNumber(number, deptName);
  }, 750);
}

// For admission staff, announce the assigned window (e.g. "Admission 4"), not just the department
function getAnnounceTarget(fallbackDept) {
  const adm = document.getElementById('admission_window')?.value;
  if (adm) return adm;
  return lastServedDept || fallbackDept || '';
}

async function repeatCall() {
  const dep = document.getElementById('department_id')?.value;
  if (!dep) return Notify.toast('No department found.', 'error');

  let number = lastServedNumber;
  let depName = getAnnounceTarget(document.querySelector('span strong')?.textContent || '');

  if (!number) {
    try {
      const user = document.getElementById('user_id')?.value || '';
      const data = await httpJson('GET', 'get_queue.php?department_id=' + encodeURIComponent(dep) + '&user_id=' + encodeURIComponent(user));
      const serving = (data.queues || []).filter(function (q) {
        return String(q.status || '').toLowerCase() === 'serving';
      })[0];
      if (serving) number = serving.queue_number;
    } catch (e) { /* keep fallback */ }
  }

  if (!number) return Notify.toast('No queue currently being served.', 'info');

  lastServedNumber = number;

  // Broadcast the repeat to live monitors/displays (best-effort, fail-open)
  try {
    httpJson('POST', 'repeat_call.php', 'department_id=' + encodeURIComponent(dep) + '&queue_number=' + encodeURIComponent(number) + '&department_name=' + encodeURIComponent(depName || '')).catch(function () {});
  } catch (e) { /* ignore */ }

  announceServed(number, depName);
}

window.repeatCall = repeatCall;

// ---- Cross-clinic mutual help (Clinic 1/2/3 pool) ----
// Pulling a patient requires the operator's own password: the Serve button
// opens a modal, and only the server-verified password advances the claim.
let _servingPool = false;
let _pendingPoolServe = null;

function openPoolServeModal(qid, dep) {
  _pendingPoolServe = { qid: String(qid), dep: String(dep) };
  const modal = document.getElementById('poolServeModal');
  if (!modal) return Notify.toast('Password modal not available.', 'error');
  const pass = document.getElementById('poolServePassword');
  const msg = document.getElementById('poolServeMessage');
  if (pass) pass.value = '';
  if (msg) { msg.style.display = 'none'; msg.textContent = ''; }
  modal.style.display = 'flex';
  if (pass) pass.focus();
}

function closePoolServeModal() {
  _pendingPoolServe = null;
  const modal = document.getElementById('poolServeModal');
  if (modal) modal.style.display = 'none';
  const msg = document.getElementById('poolServeMessage');
  if (msg) { msg.style.display = 'none'; msg.textContent = ''; }
}

async function submitPoolServe() {
  const msg = document.getElementById('poolServeMessage');
  if (msg) { msg.style.display = 'none'; msg.textContent = ''; }
  if (!_pendingPoolServe) {
    if (msg) { msg.textContent = 'No patient selected.'; msg.style.color = 'red'; msg.style.display = 'block'; }
    return;
  }
  const password = document.getElementById('poolServePassword')?.value || '';
  if (!password) {
    if (msg) { msg.textContent = 'Enter your password first.'; msg.style.color = 'red'; msg.style.display = 'block'; }
    return;
  }
  if (_servingPool) return;
  _servingPool = true;

  const { qid, dep } = _pendingPoolServe;
  try {
    const formData = new FormData();
    formData.append('queue_id', qid);
    formData.append('department_id', dep);
    formData.append('password', password);
    const token = csrfToken();
    if (token) formData.append('csrf_token', token);
    const response = await fetch('serve_pool.php', { method: 'POST', body: formData });
    const result = await response.json();

    if (result.success) {
      closePoolServeModal();
      const serveBtn = document.getElementById("serve");
      if (serveBtn && document.activeElement === serveBtn) serveBtn.blur();
      const depName = document.querySelector("span strong")?.textContent || '';
      lastServedNumber = result.queue_number;
      lastServedDept = depName || lastServedDept;
      Notify.toast('Now Serving: ' + result.queue_number + ' (' + depName + ')', 'success');
      announceServed(result.queue_number, depName || '');
      if (typeof refreshTable === 'function') refreshTable();
      if (typeof refreshPoolPanel === 'function') refreshPoolPanel();
    } else {
      if (msg) {
        msg.textContent = result.message || 'Unable to pull this patient.';
        msg.style.color = 'red';
        msg.style.display = 'block';
      } else {
        Notify.toast(result.message || 'Unable to pull this patient.', 'error');
      }
      if (typeof refreshPoolPanel === 'function') refreshPoolPanel();
    }
  } catch (e) {
    console.error(e);
    if (msg) { msg.textContent = 'An error occurred.'; msg.style.color = 'red'; msg.style.display = 'block'; }
  } finally {
    _servingPool = false;
  }
}

function servePool(qid, dep) {
  openPoolServeModal(qid, dep);
}

window.servePool = servePool;
window.closePoolServeModal = closePoolServeModal;
window.submitPoolServe = submitPoolServe;

// Per-row "Serve" action. Requires physician/admin approval first: opens the
// approval modal (no side effects). The actual serve (which server-side finishes
// the operator's current serving row) only runs after credentials are accepted.
let pendingServeQid = null;

function serveQueue(qid) {
  if (!qid) return Notify.toast("Invalid queue.", "error");
  pendingServeQid = qid;
  const modal = document.getElementById('approvalModal');
  if (!modal) {
    Notify.toast("Approval modal not available.", "error");
    return;
  }
  const pass = document.getElementById('approverPassword');
  const msg = document.getElementById('approvalMessage');
  if (pass) pass.value = '';
  if (msg) { msg.style.display = 'none'; msg.textContent = ''; }
  modal.style.display = 'flex';
  if (pass) pass.focus();
}

function closeApprovalModal() {
  pendingServeQid = null;
  const modal = document.getElementById('approvalModal');
  if (modal) modal.style.display = 'none';
  const msg = document.getElementById('approvalMessage');
  if (msg) { msg.style.display = 'none'; msg.textContent = ''; }
}

let _submittingApproval = false;
async function submitApproval() {
  const msg = document.getElementById('approvalMessage');
  if (msg) { msg.style.display = 'none'; msg.textContent = ''; }
  if (!pendingServeQid) {
    if (msg) { msg.textContent = 'No queue selected.'; msg.style.color = 'red'; msg.style.display = 'block'; }
    return;
  }
  const password = document.getElementById('approverPassword')?.value || '';
  if (!password) {
    if (msg) { msg.textContent = 'Enter the approving physician or admin password.'; msg.style.color = 'red'; msg.style.display = 'block'; }
    return;
  }

  // Guard against double-submits on the approve button (Enter + click, etc.).
  if (_submittingApproval) return;
  _submittingApproval = true;

  const dep = document.getElementById("department_id")?.value;
  const depName = document.querySelector("span strong")?.textContent || "";
  const admWin = document.getElementById("admission_window")?.value || "";
  const depLabel = admWin || depName;

  try {
    const d = await httpJson(
      "POST",
      "queue_action.php",
      "action=serve&queue_id=" + encodeURIComponent(pendingServeQid) +
        "&approver_password=" + encodeURIComponent(password)
    );

    if (d.success) {
      const qid = pendingServeQid;
      closeApprovalModal();
      const serveBtn = document.getElementById("serve");
      if (serveBtn && document.activeElement === serveBtn) serveBtn.blur();
      Notify.toast(
        "Now Serving: " + d.queue_number + (depLabel ? " (" + depLabel + ")" : ""),
        "info"
      );
      try {
        const depNameNow = depLabel || (document.querySelector("span strong")?.textContent || "") || "";
        lastServedNumber = d.queue_number;
        lastServedDept = depNameNow || lastServedDept;
        announceServeNext(d.queue_number);
      } catch (e) {}
      try {
        if (typeof refreshTable === "function") refreshTable(dep);
      } catch (e) {}
    } else {
      if (msg) {
        msg.textContent = d.message || "Unable to serve this queue.";
        msg.style.color = 'red';
        msg.style.display = 'block';
      } else {
        Notify.toast(d.message || "Unable to serve this queue.", "error");
      }
    }
  } catch (e) {
    console.error(e);
    if (msg) { msg.textContent = "An error occurred."; msg.style.color = 'red'; msg.style.display = 'block'; }
  } finally {
    _submittingApproval = false;
  }
}

window.serveQueue = serveQueue;
window.closeApprovalModal = closeApprovalModal;
window.submitApproval = submitApproval;

function unlockOnce(e) {
  if (e && e.isTrusted) {
    unlockAnnouncementAudio();
    document.removeEventListener('pointerdown', unlockOnce);
    document.removeEventListener('mousedown', unlockOnce);
    document.removeEventListener('touchstart', unlockOnce);
    document.removeEventListener('touchend', unlockOnce);
    document.removeEventListener('click', unlockOnce);
    document.removeEventListener('keydown', unlockOnce);
    document.removeEventListener('keyup', unlockOnce);
  }
}
['pointerdown', 'mousedown', 'touchstart', 'touchend', 'click', 'keydown', 'keyup'].forEach(function (t) {
  document.addEventListener(t, unlockOnce);
});

// Serve next. After a successful serve the button is blurred and stays disabled
// for a short grace window so a stray/held Enter or Space (TV remote repeat,
// snapped key) can never chain-serve patient after patient on its own. Failures
// re-enable immediately so the operator can retry without waiting.
let _serveGraceTimer = null;
async function serveNext() {
  const dep = document.getElementById("department_id")?.value;
  const depName = document.querySelector("span strong")?.textContent || "";
  const admWin = document.getElementById("admission_window")?.value || "";
  const depLabel = admWin || depName;
  if (!dep) return Notify.toast("No department found.", "error");

  const btn = document.getElementById("serve");

  try {
    // Disable while in flight so a double-click can't start two serve
    // sequences (the backend guard would reject the second one anyway).
    if (btn) btn.disabled = true;
    if (_serveGraceTimer) { clearTimeout(_serveGraceTimer); _serveGraceTimer = null; }

    // Finish current serving
    await httpJson("POST", "finish.php", "department_id=" + encodeURIComponent(dep));

    // Serve next patient
    const d = await httpJson("POST", "serve_next.php", "department_id=" + encodeURIComponent(dep));

    if (d.success) {
      Notify.toast(
        "Now Serving: " + d.queue_number + (depLabel ? " (" + depLabel + ")" : ""),
        "info"
      );

      try {
        const depNameNow = depLabel || (document.querySelector("span strong")?.textContent || "") || "";
        lastServedNumber = d.queue_number;
        lastServedDept = depNameNow || lastServedDept;
        announceServeNext(d.queue_number);
      } catch (e) {}

      try {
        if (typeof refreshTable === "function") refreshTable(dep);
      } catch (e) {}

      // Leave the button inert for 2s: drop focus so a held key can't retrigger
      // it, then re-enable through a timer that defers to refreshTable's own
      // state (waiting-area operators stay disabled while still holding a
      // serving row).
      if (btn) btn.blur();
      _serveGraceTimer = setTimeout(function () {
        _serveGraceTimer = null;
        if (btn) { btn.disabled = false; }
        if (typeof refreshTable === "function") { try { refreshTable(dep); } catch (e) {} }
      }, 2000);
      return;
    } else {
      Notify.toast(d.message || "No patients in queue", "info");
    }
  } catch (e) {
    console.error(e);
    Notify.toast("Error while serving next", "error");
  } finally {
    // A scheduled success grace timer re-enables the button; otherwise restore
    // it immediately (failure/empty path).
    if (btn && !_serveGraceTimer) btn.disabled = false;
  }
}

// ========== Hold / Unhold / Remove ==========

function postQueueAction(action, qid) {
  return httpJson('POST', 'queue_action.php', 'action=' + encodeURIComponent(action) + '&queue_id=' + encodeURIComponent(qid));
}

async function holdQueue(qid) {
  try {
    const d = await postQueueAction('hold', qid);
    if (d.success) {
      Notify.toast('Queue ' + d.queue_number + ' on hold', 'info');
      if (typeof refreshTable === 'function') refreshTable();
    } else {
      Notify.toast(d.message || 'Failed to hold queue', 'error');
    }
  } catch (e) {
    console.error(e);
    Notify.toast('Error holding queue', 'error');
  }
}

async function unholdQueue(qid) {
  try {
    const d = await postQueueAction('unhold', qid);
    if (d.success) {
      Notify.toast('Queue ' + d.queue_number + ' unheld', 'success');
      if (typeof refreshTable === 'function') refreshTable();
    } else {
      Notify.toast(d.message || 'Failed to unhold queue', 'error');
    }
  } catch (e) {
    console.error(e);
    Notify.toast('Error unholding queue', 'error');
  }
}

async function removeQueue(qid) {
  if (!confirm('Remove this queue? It will be marked as done.')) return;
  try {
    const d = await postQueueAction('remove', qid);
    if (d.success) {
      Notify.toast('Queue ' + d.queue_number + ' removed', 'success');
      if (typeof refreshTable === 'function') refreshTable();
    } else {
      Notify.toast(d.message || 'Failed to remove queue', 'error');
    }
  } catch (e) {
    console.error(e);
    Notify.toast('Error removing queue', 'error');
  }
}

window.holdQueue = holdQueue;
window.unholdQueue = unholdQueue;
window.removeQueue = removeQueue;

// ---- Activity-aware session poll -------------------------------------
// Every 45s confirm this browser still holds the account's active login and
// keep the activity heartbeat. last_activity is only stamped when a human is
// actually at the machine: JS tracks real input (keyboard/pointer/click/touch),
// the poll passes activity=1 only when input happened within the freshness
// window, and activity=0 otherwise. Idle-but-on PCs therefore go silent, and
// after IDLE_EXPIRY (server) the session is marked expired (reason=inactive),
// routing through logout.php so the station/section is freed.
// Bounce detection stays unconditional: another_device still wins every tick.
const ACTIVITY_FRESH_MS = 60000; // human input must be within this window to stamp
const ACTIVITY_WAKE_GRACE_MS = 15000; // returning user: re-stamp before expiring
const ACTIVITY_STAMP_DEBOUNCE_MS = 5000; // min gap between immediate stamps

let _lastHumanActivityAt = Date.now();
let _lastStampPollAt = 0;

function stampActivityNow() {
  // Fire an immediate heartbeat right after a real input so a returning user
  // is never expired between waking the PC and the next 45s tick.
  const now = Date.now();
  if (now - _lastStampPollAt < ACTIVITY_STAMP_DEBOUNCE_MS) return;
  _lastStampPollAt = now;
  httpJson('GET', 'session_check.php?activity=1', null).catch(function () {});
}
function onHumanActivity() {
  _lastHumanActivityAt = Date.now();
  stampActivityNow();
}
let _activityThrottled = false;
function activityThrottle() {
  if (_activityThrottled) return;
  _activityThrottled = true;
  onHumanActivity();
  setTimeout(function () { _activityThrottled = false; }, 1000);
}
window.addEventListener('keydown', onHumanActivity, { passive: true });
window.addEventListener('pointerdown', onHumanActivity, { passive: true });
window.addEventListener('touchstart', onHumanActivity, { passive: true });
window.addEventListener('click', onHumanActivity, { passive: true });
window.addEventListener('pointermove', activityThrottle, { passive: true });
window.addEventListener('wheel', activityThrottle, { passive: true });

let _sessionPollStarted = false;
function startSessionPoll() {
  if (_sessionPollStarted) return;
  _sessionPollStarted = true;
  function tick() {
    const fresh = (Date.now() - _lastHumanActivityAt) < ACTIVITY_FRESH_MS;
    const url = fresh ? 'session_check.php?activity=1' : 'session_check.php?activity=0';
    httpJson('GET', url, null)
      .then(function (d) {
        if (!d) return;
        if (d.reason === 'another_device') {
          // Route through logout so any section/station this device holds is
          // released before the session is destroyed.
          window.location.href = 'logout.php?reason=another_device';
        } else if (d.reason === 'inactive') {
          // Wake-race guard: a user who just returned (input within the grace
          // window) may hit a server stamp that was already stale at poll time.
          // Re-stamp once; only proceed to expiry if it is still stale after.
          if (Date.now() - _lastHumanActivityAt < ACTIVITY_WAKE_GRACE_MS) {
            httpJson('GET', 'session_check.php?activity=1', null)
              .then(function (d2) {
                if (d2 && d2.reason === 'inactive') window.location.href = 'logout.php?reason=inactive';
              })
              .catch(function () { window.location.href = 'logout.php?reason=inactive'; });
          } else {
            window.location.href = 'logout.php?reason=inactive';
          }
        } else if (d.logged_in === false) {
          window.location.href = 'login.php';
        }
      })
      .catch(function () { /* transient network/DB hiccup: keep polling */ });
  }
  tick();
  setInterval(tick, 45000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startSessionPoll);
} else {
  startSessionPoll();
}
