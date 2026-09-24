let currentDept = document.getElementById('department_id')?.value || null;
let currentUser = document.getElementById('user_id')?.value || null;
let poolIds = null;
let hasServingRow = false;
let currentServedId = null;
const waitAreaDeptEl = document.getElementById('wait_area_dept');
const waitAreaDept = waitAreaDeptEl ? waitAreaDeptEl.value === '1' : false;

const isSuperadminEl = document.getElementById('is_superadmin');
const isSuperadmin = isSuperadminEl ? isSuperadminEl.value === '1' : false;

const poolIdsEl = document.querySelector('[data-pool-ids]');
if (poolIdsEl) {
  poolIds = (poolIdsEl.getAttribute('data-pool-ids') || '')
    .split(',')
    .map(Number)
    .filter(n => !isNaN(n));
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// ---- Wait-time helpers (uses created_at added to get_queue.php) ----
function parseQueueDate(s) {
  if (!s) return null;
  const t = String(s).trim().replace(' ', 'T');
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d;
}
function waitText(started) {
  if (!started) return '—';
  const ms = Date.now() - started.getTime();
  if (ms < 0) return '0s';
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60), s = sec % 60;
  return m > 0 ? m + 'm ' + s + 's' : s + 's';
}
function waitClass(started) {
  if (!started) return '';
  const min = (Date.now() - started.getTime()) / 60000;
  if (min >= 30) return 'is-long';
  if (min >= 15) return 'is-mid';
  return 'is-now';
}
function fmtWaitCell(started, el) {
  if (!el) return;
  el.textContent = waitText(started);
  el.className = 'qwait ' + waitClass(started);
}
function renderQueueWaitTimes() {
  document.querySelectorAll('#queue-body td.qwait[data-started]').forEach(td => {
    fmtWaitCell(parseQueueDate(td.getAttribute('data-started')), td);
  });
}

// ---- Last-fetch timestamp (Manila-anchored) ----
const FETCH_EL_ID = 'q-fetch-time';
const FETCH_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function formatFetchPhil(d) {
  if (!d || isNaN(d.getTime())) return null;
  const phil = new Date(d.getTime() + 8 * 3600 * 1000);
  const p = n => String(n).padStart(2, '0');
  return FETCH_MONTHS[phil.getUTCMonth()] + ' ' + p(phil.getUTCDate()) + ', ' +
    p(phil.getUTCHours()) + ':' + p(phil.getUTCMinutes()) + ':' + p(phil.getUTCSeconds());
}
function recordFetchTime(headerDate) {
  const el = document.getElementById(FETCH_EL_ID);
  if (!el) return;
  const base = headerDate ? new Date(headerDate) : new Date();
  const text = formatFetchPhil(base);
  if (text) el.textContent = 'Fetched ' + text;
}

// Issue date/time (e.g. "Sep 22, 10:15 AM") rendered under the queue number.
// created_at is stored as Manila wall-clock; render the components directly so
// the device's clock/TZ can never skew the label.
function fmtIssued(raw) {
  if (!raw) return '';
  const t = String(raw).trim();
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return '';
  const p = n => String(n).padStart(2, '0');
  const hh = +m[4] % 12 || 12;
  return FETCH_MONTHS[+m[2] - 1] + ' ' + (+m[3]) + ', ' +
    hh + ':' + p(+m[5]) + ' ' + ((+m[4]) >= 12 ? 'PM' : 'AM');
}

// ---- Search / filter / pagination state ----
let filterState = 'all';
const PAGE_SIZE = 10;
let currentPage = 1;
let lastQueueRows = [];
let searchDebounce = null;

function searchQuery() {
  return (document.getElementById('qsearch')?.value || '').trim().toLowerCase();
}

// Applies the active type filter + search text to the full queue list.
function filteredQueues() {
  const q = searchQuery();
  return (Array.isArray(lastQueueRows) ? lastQueueRows : []).filter(row => {
    const st = String(row.status || '').toLowerCase();
    let show = true;
    if (show && filterState === 'waiting' && st !== 'waiting') show = false;
    if (show && filterState === 'hold' && st !== 'hold') show = false;
    if (show && filterState === 'priority' && !(row.category === 'priority' || row.category === 'emergency')) show = false;
    if (show && q) {
      const poolLabel = row.category === 'emergency' ? 'emergency' : (row.category === 'priority' ? 'priority' : 'regular');
      const statusLabel = st === 'serving' ? 'serving' : (st === 'hold' ? 'hold' : 'waiting');
      const qnum = String(row.queue_number || '').toLowerCase();
      show = `${qnum} ${poolLabel} ${statusLabel}`.includes(q);
    }
    return show;
  });
}

// Builds a <tr> for one queue row; `globalIdx` is its 1-based position in the
// full (unpaged) list, so the leading "No." column stays stable across pages.
function buildRow(q, globalIdx) {
  const st = String(q.status || '').toLowerCase();
  const tr = document.createElement('tr');
  const isServing = st === 'serving';
  const isHold = st === 'hold';
  tr.className = isServing ? 'highlight-row' : (isHold ? 'hold-row' : 'waiting-row');
  tr.dataset.status = st;
  tr.dataset.category = q.category || 'regular';

  const isEmergency = q.category === 'emergency';
  const isPriority = q.category === 'priority';
  let typeHtml = 'Regular';
  if (isEmergency) typeHtml = `<span class="emergency-badge">EMERGENCY</span>`;
  else if (isPriority) typeHtml = `<span class="priority-badge">PRIORITY</span>`;

  let statusLabel = isServing ? 'Serving' : (isHold ? 'Hold' : 'Waiting');

  let actionsHtml = '';
  let items = '';
  if (st === 'waiting' && !(waitAreaDept && hasServingRow)) {
    items += `<button type="button" class="row-action-item row-action-item-serve" data-action="serve" data-id="${escapeHtml(q.id)}">Serve</button>`;
  }
  if (st === 'waiting' || st === 'serving') {
    items += `<button type="button" class="row-action-item" data-action="hold" data-id="${escapeHtml(q.id)}">Hold</button>`;
  }
  if (st === 'hold') {
    items += `<button type="button" class="row-action-item" data-action="unhold" data-id="${escapeHtml(q.id)}">Unhold</button>`;
  }
  if ((st === 'waiting' || st === 'hold') && isSuperadmin) {
    items += `<button type="button" class="row-action-item row-action-item-danger" data-action="remove" data-id="${escapeHtml(q.id)}">Remove</button>`;
  }
  if (items) {
    actionsHtml = `<div class="row-actions"><button type="button" class="row-actions-toggle" title="Actions" aria-label="Row actions" aria-expanded="false"><svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></button><div class="row-actions-menu" hidden>${items}</div></div>`;
  }
  if (!actionsHtml) actionsHtml = '<span class="row-noaction">—</span>';

  const stClass = isServing ? 'st-serving' : (isHold ? 'st-hold' : 'st-waiting');
  const statusDot = `<span class="st-dot ${stClass}" aria-hidden="true"></span> ${statusLabel}`;

  const started = parseQueueDate(q.created_at);
  const startAttr = q.created_at ? escapeHtml(String(q.created_at)) : '';
  const waitHtml = `<td class="qwait ${waitClass(started)}" data-started="${startAttr}">${waitText(started)}</td>`;

  const issuedRaw = fmtIssued(q.created_at);
  const issued = issuedRaw ? escapeHtml(issuedRaw) : '—';
  const transferredRaw = q.transferred_at ? fmtIssued(q.transferred_at) : '';
  const transferred = transferredRaw ? `<span class="q-transferred">Transferred ${escapeHtml(transferredRaw)}</span>` : '';

  tr.innerHTML =
    `<td class="qidx">${globalIdx}</td>` +
    `<th scope="row"><span class="qnum">${escapeHtml(q.queue_number)}</span></th>` +
    `<td class="qdatetime-cell">${issued}${transferred}</td>` +
    `<td>${statusDot}</td>` +
    `<td>${typeHtml}</td>` +
    waitHtml +
    `<td>${actionsHtml}</td>`;
  return tr;
}

function paginateRows(rows) {
  const total = rows.length;
  const tp = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (currentPage < 1) currentPage = 1;
  if (currentPage > tp) currentPage = tp;
  const start = (currentPage - 1) * PAGE_SIZE;
  return { rows: rows.slice(start, start + PAGE_SIZE), start, total, tp };
}

// Renders the filtered + paginated slice into the table and refreshes both the
// pagination bar and the filter label. Every render path funnels through here so
// the table height only ever changes at the 10-row page boundary, never on a
// search keystroke.
function renderQueueTable() {
  const tbody = document.getElementById('queue-body');
  if (!tbody) return;
  const filtered = filteredQueues();
  const { rows: pageRows, start, total, tp } = paginateRows(filtered);
  tbody.innerHTML = '';
  if (!pageRows.length) {
    const emptyMsg = (searchQuery() || filterState !== 'all') ? 'No matching queues' : 'No active queues';
    tbody.innerHTML = `<tr><td colspan="7" class="ctrl-empty">${emptyMsg}</td></tr>`;
  } else {
    pageRows.forEach((q, i) => tbody.appendChild(buildRow(q, start + i + 1)));
  }
  updatePagination(total, tp);
  renderQueueWaitTimes();
}

function updatePagination(total, tp) {
  const info = document.getElementById('q-page-info');
  const prev = document.getElementById('q-prev-btn');
  const next = document.getElementById('q-next-btn');
  const input = document.getElementById('q-page-input');
  const totalEl = document.getElementById('q-page-total');
  if (info) {
    let text;
    if (!total) text = 'Showing 0 of 0';
    else if (tp === 1) text = 'Showing 1-' + total + ' of ' + total;
    else text = 'Showing ' + ((currentPage - 1) * PAGE_SIZE + 1) + '-' + Math.min(currentPage * PAGE_SIZE, total) + ' of ' + total;
    info.textContent = text;
  }
  if (prev) prev.disabled = currentPage <= 1;
  if (next) next.disabled = currentPage >= tp;
  if (input) { input.value = String(currentPage); input.max = String(tp); }
  if (totalEl) totalEl.textContent = 'of ' + tp;
}

function applyQueueFilter() {
  currentPage = 1;
  renderQueueTable();
}

function attachQueueTools() {
  const input = document.getElementById('qsearch');
  const sel = document.getElementById('qfilter');
  if (input) input.addEventListener('input', () => {
    if (searchDebounce) clearTimeout(searchDebounce);
    searchDebounce = setTimeout(applyQueueFilter, 150);
  });
  if (sel) sel.addEventListener('change', () => {
    filterState = sel.value;
    applyQueueFilter();
  });
}

function attachPagination() {
  const prev = document.getElementById('q-prev-btn');
  const next = document.getElementById('q-next-btn');
  const input = document.getElementById('q-page-input');
  const goToPage = () => {
    const v = parseInt(input?.value || '', 10);
    if (isNaN(v)) { renderQueueTable(); return; }
    currentPage = v;
    renderQueueTable();
    if (input) input.blur();
  };
  if (prev) prev.addEventListener('click', () => {
    if (currentPage > 1) { currentPage -= 1; renderQueueTable(); }
  });
  if (next) next.addEventListener('click', () => {
    const total = filteredQueues().length;
    const tp = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (currentPage < tp) { currentPage += 1; renderQueueTable(); }
  });
  if (input) {
    input.addEventListener('change', goToPage);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') goToPage(); });
  }
}

// ---- Hold the currently served patient ----
function holdCurrent() {
  if (!currentServedId) {
    if (window.Notify && typeof Notify.toast === 'function') Notify.toast('No patient is currently being served.', 'error');
    return;
  }
  if (typeof window.holdQueue === 'function') window.holdQueue(currentServedId);
}

async function refreshTable() {
    const tbody = document.getElementById("queue-body");
    if (!tbody || !currentDept) return;

    try {
        const data = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', `get_queue.php?department_id=${encodeURIComponent(currentDept)}&user_id=${encodeURIComponent(currentUser)}`, true);
            xhr.onreadystatechange = () => {
                if (xhr.readyState !== 4) return;
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        recordFetchTime(xhr.getResponseHeader('Date'));
                        resolve(JSON.parse(xhr.responseText));
                    } catch (e) { reject(e); }
                } else reject(new Error('Network error'));
            };
            xhr.onerror = () => reject(new Error('Network error'));
            xhr.send();
        });
        const queueRows = Array.isArray(data.queues)
          ? data.queues.filter(q => {
              const st = String(q.status || '').toLowerCase();
              return !(currentDept == 3 && st === 'serving' && q.served_by != currentUser);
            })
          : [];
        const servingRow = queueRows.find(q =>
          String(q.status || '').toLowerCase() === 'serving' && String(q.served_by) === String(currentUser));
        hasServingRow = !!servingRow;
        currentServedId = servingRow ? servingRow.id : null;
        lastQueueRows = queueRows;
        renderCtrlSummary(queueRows);
        const transferBtn = document.getElementById('transfer-btn');
        if (transferBtn) {
          transferBtn.disabled = !hasServingRow;
          transferBtn.classList.toggle('is-disabled', !hasServingRow);
        }
        const holdBtn = document.getElementById('hold-btn');
        if (holdBtn) {
          holdBtn.disabled = !hasServingRow;
          holdBtn.classList.toggle('is-disabled', !hasServingRow);
        }
        // One operator, one serving row: while this operator holds a serving
        // patient, Serve Next and the Next-Up play button stay disabled. The
        // row is cleared (status -> waiting, served_by -> null) by Transfer to
        // Others, Hold, a per-row Serve, or the stale auto-finish; the next
        // refreshTable() then re-enables them.
        const serveBtn = document.getElementById('serve');
        const randomBtn = document.getElementById('serve-random');
        const nextGoBtn = document.querySelector('.qnext-go');
        if (serveBtn) {
          serveBtn.disabled = hasServingRow;
          serveBtn.classList.toggle('is-disabled', hasServingRow);
        }
        if (randomBtn) {
          randomBtn.disabled = hasServingRow;
          randomBtn.classList.toggle('is-disabled', hasServingRow);
        }
        if (nextGoBtn) {
          nextGoBtn.disabled = hasServingRow;
          nextGoBtn.classList.toggle('is-disabled', hasServingRow);
        }
        if (document.getElementById('pool-rows')) refreshPoolPanel();

        renderQueueTable();

    } catch (err) {
        console.error("refreshTable error:", err);
        tbody.innerHTML = `<tr><td colspan="7" class="ctrl-error">Error loading queues</td></tr>`;
    }
}

function renderCtrlSummary(rows) {
    const serveEl = document.getElementById('serve-num');
    const windowEl = document.getElementById('serve-window');
    const windowNumEl = document.getElementById('serve-window-num');
    const nextEl = document.getElementById('next-up');
    const nextTypeEl = document.getElementById('next-up-type');
    const queueCount = document.getElementById('queue-count');
    const bell = document.getElementById('qbell-badge');
    if (!serveEl && !nextEl) return;

    let serving = null, nextUp = null, nextCat = 'regular';
    let cServing = 0, cWaiting = 0, cHold = 0;
    rows.forEach(q => {
        const st = String(q.status || '').toLowerCase();
        if (st === 'serving') { cServing++; if (!serving) serving = q.queue_number; }
        else if (st === 'hold') { cHold++; }
        else { cWaiting++; if (!nextUp) { nextUp = q.queue_number; nextCat = q.category || 'regular'; } }
    });

    if (serveEl) serveEl.textContent = serving != null ? String(serving) : '—';
    if (nextEl) nextEl.textContent = nextUp != null ? String(nextUp) : '—';

    const catLabel = nextCat === 'emergency' ? 'Emergency' : (nextCat === 'priority' ? 'Priority' : 'Regular');
    if (nextTypeEl) nextTypeEl.textContent = nextUp != null ? catLabel : 'Idle';

    const admWin = document.getElementById('admission_window')?.value || '';
    if (windowEl) windowEl.textContent = admWin ? admWin : '—';
    if (windowNumEl) windowNumEl.textContent = admWin ? admWin : '—';

    if (queueCount) queueCount.textContent = cWaiting + ' patient' + (cWaiting === 1 ? '' : 's') + ' waiting';
    if (bell) {
        bell.textContent = String(cWaiting);
        bell.hidden = !(cWaiting > 0);
    }
}

function setCurrentDept(id) {
    currentDept = id;
    refreshTable();
    refreshPoolPanel();
}

// ---- Cross-clinic mutual help panel (Clinic 1/2/3 pool) ----
async function refreshPoolPanel() {
    const tbody = document.getElementById('pool-rows');
    if (!tbody) return;

    try {
        const data = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', 'get_pool_waiting.php', true);
            xhr.onreadystatechange = () => {
                if (xhr.readyState !== 4) return;
                if (xhr.status >= 200 && xhr.status < 300) {
                    try { resolve(JSON.parse(xhr.responseText)); } catch (e) { reject(e); }
                } else reject(new Error('Network error'));
            };
            xhr.onerror = () => reject(new Error('Network error'));
            xhr.send();
        });

        const pool = (data && Array.isArray(data.pool)) ? data.pool : [];
        const mineFree = !!(data && data.mine_free);
        let rows = '';
        let any = false;
        pool.forEach(d => {
            (d.rows || []).forEach(r => {
                any = true;
                let cat = '';
                if (r.category === 'emergency') cat = ' <span class="emergency-badge">EMERGENCY</span>';
                else if (r.category === 'priority') cat = ' <span class="priority-badge">PRIORITY</span>';
                rows += '<tr>' +
                    '<td>' + escapeHtml(d.name) + '</td>' +
                    '<td>' + escapeHtml(r.queue_number) + cat + '</td>' +
                    '<td><button type="button" class="ctrl-btn ctrl-btn-primary ctrl-btn-mini" data-pool-serve="1" data-qid="' + escapeHtml(r.id) + '" data-dep="' + escapeHtml(d.id) + '"' + (mineFree && !hasServingRow ? '' : ' disabled') + '>Serve</button></td>' +
                    '</tr>';
            });
        });

        if (!any) {
            tbody.innerHTML = '<tr><td colspan="3" class="ctrl-empty">All clinics are clear &mdash; no one to help.</td></tr>';
        } else {
            const note = hasServingRow
                ? 'Finish your current patient first to help other clinics.'
                : 'Serve your own waiting queue first to help other clinics.';
            if (!mineFree || hasServingRow) {
                rows = '<tr><td colspan="3" class="ctrl-empty">' + note + '</td></tr>' + rows;
            }
            tbody.innerHTML = rows;
        }
    } catch (err) {
        console.error('refreshPoolPanel error:', err);
        tbody.innerHTML = '<tr><td colspan="3" class="ctrl-empty">Error loading clinics</td></tr>';
    }
}

function attachPoolActions() {
    const tbody = document.getElementById('pool-rows');
    if (!tbody || tbody.hasAttribute('data-pool-actions-attached')) return;
    tbody.setAttribute('data-pool-actions-attached', '1');
    tbody.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-pool-serve]');
        if (!btn || btn.disabled) return;
        const qid = btn.getAttribute('data-qid');
        const dep = btn.getAttribute('data-dep');
        if (window.servePool) window.servePool(qid, dep);
    });
}

// WebSocket
(function initSocket() {
    if (!window.io || !currentDept) return;
    const socket = io(window._QUEUE_SOCKET_HOST || 'http://localhost:3000', { transports: ['websocket'] });
    socket.on('connect', () => {
        // Subscribe to the depts this controller cares about so only relevant
        // serve events wake this page (room-scoped delivery on the server).
        const depts = [Number(currentDept)];
        if (poolIds) poolIds.forEach(function (id) { depts.push(Number(id)); });
        socket.emit('subscribe', { depts: depts, page: 'controller', label: document.title || ('Dept ' + currentDept) });
    });
    socket.on('queue-updated', msg => {
        const d = Number(msg.dept);
        if (d === Number(currentDept)) refreshTable();
        if (poolIds && poolIds.includes(d)) refreshPoolPanel();
    });
})();

// Action button delegation (hold / unhold / remove) via the "..." dropdown
function closeRowMenus() {
    document.querySelectorAll('.row-actions-menu').forEach(menu => {
        menu.classList.remove('open');
        menu.hidden = true;
        menu.style.position = '';
        menu.style.top = '';
        menu.style.left = '';
        menu.removeAttribute('data-openup');
        const toggle = menu.parentElement?.querySelector('.row-actions-toggle');
        if (toggle) toggle.setAttribute('aria-expanded', 'false');
    });
}

function positionRowMenu(menu, toggle) {
    const btnRect = toggle.getBoundingClientRect();
    menu.style.position = 'fixed';
    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;
    let left = Math.max(8, Math.min(btnRect.right - mw, window.innerWidth - mw - 8));
    menu.style.left = left + 'px';
    if (window.innerHeight - btnRect.bottom < mh + 8) {
        menu.style.top = Math.max(8, btnRect.top - mh - 6) + 'px';
        menu.setAttribute('data-openup', '1');
    } else {
        menu.style.top = (btnRect.bottom + 6) + 'px';
    }
}

function attachRowActions() {
    const tbody = document.getElementById("queue-body");
    if (!tbody || tbody.hasAttribute('data-actions-attached')) return;
    tbody.setAttribute('data-actions-attached', '1');
    tbody.addEventListener('click', (e) => {
        const toggle = e.target.closest('button.row-actions-toggle');
        if (toggle) {
            e.preventDefault();
            e.stopPropagation();
            const menu = toggle.parentElement.querySelector('.row-actions-menu');
            const willOpen = menu && menu.hidden;
            closeRowMenus();
            if (willOpen) {
                menu.hidden = false;
                menu.classList.add('open');
                toggle.setAttribute('aria-expanded', 'true');
                positionRowMenu(menu, toggle);
            } else {
                toggle.setAttribute('aria-expanded', 'false');
            }
            return;
        }
        const item = e.target.closest('button.row-action-item');
        if (!item) return;
        const qid = item.getAttribute('data-id');
        const action = item.getAttribute('data-action');
        closeRowMenus();
        if (action === 'serve' && typeof window.serveQueue === 'function') window.serveQueue(qid);
        else if (action === 'hold' && typeof window.holdQueue === 'function') window.holdQueue(qid);
        else if (action === 'unhold' && typeof window.unholdQueue === 'function') window.unholdQueue(qid);
        else if (action === 'remove' && typeof window.removeQueue === 'function') window.removeQueue(qid);
    });
}
document.addEventListener('click', closeRowMenus);
document.addEventListener('DOMContentLoaded', () => {
    attachRowActions();
    attachPoolActions();
    attachQueueTools();
    attachPagination();
    refreshTable();
    refreshPoolPanel();
    setInterval(renderQueueWaitTimes, 15000);
});
window.refreshTable = refreshTable;
window.setCurrentDept = setCurrentDept;
window.setCurrentDept = setCurrentDept;
window.refreshPoolPanel = refreshPoolPanel;
window.holdCurrent = holdCurrent;
window.attachQueueTools = attachQueueTools;
