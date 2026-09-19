let currentDept = document.getElementById('department_id')?.value || null;
let currentUser = document.getElementById('user_id')?.value || null;
let poolIds = null;
let hasServingRow = false;
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
                    try { resolve(JSON.parse(xhr.responseText)); } catch (e) { reject(e); }
                } else reject(new Error('Network error'));
            };
            xhr.onerror = () => reject(new Error('Network error'));
            xhr.send();
        });
        tbody.innerHTML = '';

        const hasServing = Array.isArray(data.queues) && data.queues.some(q =>
          String(q.status || '').toLowerCase() === 'serving' && String(q.served_by) === String(currentUser));
        hasServingRow = hasServing;
        const transferBtn = document.getElementById('transfer-btn');
        if (transferBtn) {
          transferBtn.disabled = !hasServing;
          transferBtn.classList.toggle('is-disabled', !hasServing);
        }
        // Waiting-area / admission operators can only serve one patient at a time:
        // while they hold a serving row, Serve Next stays disabled.
        if (waitAreaDept) {
          const serveBtn = document.getElementById('serve');
          if (serveBtn) {
            serveBtn.disabled = hasServing;
            serveBtn.classList.toggle('is-disabled', hasServing);
          }
        }
        if (document.getElementById('pool-rows')) refreshPoolPanel();

        if (Array.isArray(data.queues) && data.queues.length) {
            data.queues.forEach(q => {
                const st = String(q.status || '').toLowerCase();
                if (currentDept == 3 && st === 'serving' && q.served_by != currentUser) return;

                const tr = document.createElement('tr');
                const isServing = st === 'serving';
                const isHold = st === 'hold';
                tr.className = isServing ? 'highlight-row' : '';

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
                  actionsHtml = `<div class="row-actions"><button type="button" class="row-actions-toggle" title="Actions">&#8942;</button><div class="row-actions-menu" hidden>${items}</div></div>`;
                }
                if (!actionsHtml) actionsHtml = '<span style="color:#7fa8d8;">—</span>';

                tr.innerHTML = `<td>${escapeHtml(q.queue_number)}</td><td>${statusLabel}</td><td>${typeHtml}</td><td>${actionsHtml}</td>`;
                tbody.appendChild(tr);
            });
        } else {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#4a6b8a;">No active queues</td></tr>`;
        }

    } catch (err) {
        console.error("refreshTable error:", err);
        tbody.innerHTML = `<tr><td colspan="4" style="color:#c62828;text-align:center;">Error loading queues</td></tr>`;
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
                positionRowMenu(menu, toggle);
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
    refreshTable();
    refreshPoolPanel();
});
window.refreshTable = refreshTable;
window.setCurrentDept = setCurrentDept;
window.refreshPoolPanel = refreshPoolPanel;
