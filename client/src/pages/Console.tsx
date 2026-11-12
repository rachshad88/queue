import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../auth';
import { Layout } from '../components/Layout';
import { CategoryBadge, Modal, PasswordPrompt, StatusBadge, useToast } from '../components/ui';
import { formatDateTime } from '../format';
import { useDepartmentEvents } from '../socket';

interface Row {
  id: number;
  queue_number: string;
  status: string;
  category: string;
  created_at: string;
  transferred_at: string | null;
  issued_by_name: string;
  is_returning: boolean;
  transferred_from_name: string | null;
  transferred_to_name: string | null;
  department_name: string;
  /** Being served by a staffer who has signed out; a colleague decides what happens next. */
  unattended: boolean;
  unattended_by_name: string | null;
}

interface Target {
  id: number;
  name: string;
  waiting: number;
}

/** Same rule as the server: tag the emptiest choices only when that says something. */
function shortestIds(targets: (Target & { disabled: boolean })[]): number[] {
  const open = targets.filter((t) => !t.disabled);
  if (open.length < 2) {
    return [];
  }
  const min = Math.min(...open.map((t) => t.waiting));
  if (Math.max(...open.map((t) => t.waiting)) === min) {
    return [];
  }
  const shortest = open.filter((t) => t.waiting === min).map((t) => t.id);
  return shortest.length <= 2 ? shortest : [];
}

export function Console() {
  const { user, config, refresh } = useSession();
  const toast = useToast();
  const [info, setInfo] = useState<Record<string, any> | null>(null);
  const [q, setQ] = useState<Record<string, any> | null>(null);
  const [busy, setBusy] = useState(false);
  const [transferTargets, setTransferTargets] = useState<Target[] | null>(null);
  const [approveRow, setApproveRow] = useState<Row | null>(null);
  const [pool, setPool] = useState<Record<string, any> | null>(null);
  const [poolPick, setPoolPick] = useState<{ department_id: number; queue_id: number; queue_number: string } | null>(null);
  const [returnCode, setReturnCode] = useState('');
  const [changePw, setChangePw] = useState(false);
  const [newPw, setNewPw] = useState('');
  const [takeover, setTakeover] = useState({ department_id: 0, section_id: 0 });

  const deptId: number = info?.department_id ?? user?.department_id ?? 0;

  const loadInfo = useCallback(async () => {
    const data = await api('/console');
    if (data.department_id !== undefined) {
      setInfo(data);
      setTakeover({ department_id: data.department_id, section_id: data.takeover_section_id ?? 0 });
      if (data.show_change_pw) {
        setChangePw(true);
      }
    }
  }, []);

  const loadQueue = useCallback(async () => {
    if (!deptId) {
      return;
    }
    const data = await api(`/queue?department_id=${deptId}`);
    if (data.success) {
      setQ(data);
    }
    if (info?.in_pool_clinic) {
      const p = await api('/pool-waiting');
      setPool(p.success ? p : null);
    }
  }, [deptId, info?.in_pool_clinic]);

  useEffect(() => {
    void loadInfo();
  }, [loadInfo]);
  useEffect(() => {
    void loadQueue();
    const timer = window.setInterval(() => void loadQueue(), 10000);
    return () => window.clearInterval(timer);
  }, [loadQueue]);
  useDepartmentEvents(deptId ? [deptId, ...(q?.dental_department_id && deptId === config.waiting_dept_id ? [q.dental_department_id] : [])] : [], 'controller', {
    'queue-updated': () => void loadQueue(),
  });

  /** Run one console action, toast its outcome and refresh. */
  const act = async (path: string, body: Record<string, unknown>, okMessage?: (r: Record<string, any>) => string): Promise<boolean> => {
    if (busy) {
      return false;
    }
    setBusy(true);
    const result = await api(path, { body });
    setBusy(false);
    toast(result.success ? (okMessage?.(result) ?? result.message ?? 'Done.') : (result.message ?? 'That did not work.'), result.success ? 'success' : 'error');
    await loadQueue();
    return !!result.success;
  };

  const serving: string | null = q?.serving_queue_number ?? null;
  const rows: Row[] = q?.queues ?? [];
  const unattendedCount = rows.filter((r) => r.unattended).length;
  /** One patient at a time: nobody new until the current one is finished or transferred. */
  const finishFirstHint = serving ? `Finish or transfer ${serving} first.` : undefined;

  const openTransfer = async (): Promise<void> => {
    const list = await api<any>('/departments');
    setTransferTargets(Array.isArray(list) ? list : (info?.transfer_departments ?? []));
  };

  const doTakeover = async (): Promise<void> => {
    const result = await api('/switch-department', { body: takeover });
    if (!result.success) {
      toast(result.message ?? 'Could not switch department.', 'error');
      return;
    }
    toast(`Now working ${result.department_name}${result.active_window ? `, ${result.active_window}` : ''}.`, 'success');
    setQ(null);
    await refresh();
    await loadInfo();
  };

  const takeoverDept = info?.departments?.find((d: Target) => d.id === takeover.department_id);
  const takeoverSectioned = takeover.department_id === config.admission_dept_id || takeover.department_id === config.waiting_dept_id || /ADMISSION|WAITING/i.test(takeoverDept?.name ?? '');
  const [takeoverWindows, setTakeoverWindows] = useState<{ id: number; section_name: string; staff: string | null }[]>([]);
  useEffect(() => {
    if (!user?.is_superadmin || !takeoverSectioned) {
      setTakeoverWindows([]);
      return;
    }
    const kind = takeover.department_id === config.waiting_dept_id || /WAITING/i.test(takeoverDept?.name ?? '') ? 'waiting' : 'admission';
    void api(`/sections/${kind}`).then((r) => setTakeoverWindows(r.sections ?? []));
  }, [takeover.department_id, takeoverSectioned, takeoverDept?.name, user?.is_superadmin, config.waiting_dept_id]);

  if (!info) {
    return <Layout title="Queue console"><p className="muted">Loading the console</p></Layout>;
  }

  const needsWindow = info.sectioned && !q?.active_window && !info.active_window;
  const isPlainNumber = /^(?:R|P|E)-\d+$/.test(serving ?? '');
  const targets = (transferTargets ?? [])
    .filter((t) => t.id !== q?.serving_department_id)
    .map((t) => ({ ...t, disabled: isPlainNumber && t.id === q?.dental_department_id }));
  const shortest = shortestIds(targets);

  return (
    <Layout
      title={info.department_name || 'Queue console'}
      actions={
        <>
          {(q?.active_window ?? info.active_window) && <span className="badge status-serving">{q?.active_window ?? info.active_window}</span>}
          {q?.window_serves_priority != null && <span className={`badge ${q.window_serves_priority ? 'cat-priority' : 'cat-regular'}`}>{q.window_serves_priority ? 'Priority + regular' : 'Regular only'}</span>}
          {info.sectioned && !info.is_superadmin && <Link className="btn btn-sm" to={`/choose-section/${info.section_kind}`} style={{ textDecoration: 'none' }}>Change window</Link>}
        </>
      }
    >
      <div className="stack">
        {info.is_superadmin && (
          <div className="card">
            <div className="filters">
              <label className="field">
                <span>Work as department</span>
                <select value={takeover.department_id} onChange={(e) => setTakeover({ department_id: Number(e.target.value), section_id: 0 })}>
                  {info.departments.map((d: Target) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </label>
              {takeoverSectioned && (
                <label className="field">
                  <span>Window</span>
                  <select value={takeover.section_id} onChange={(e) => setTakeover((t) => ({ ...t, section_id: Number(e.target.value) }))}>
                    <option value={0}>Choose a window</option>
                    {takeoverWindows.map((w) => (
                      <option key={w.id} value={w.id}>{w.section_name}{w.staff ? ` (${w.staff})` : ''}</option>
                    ))}
                  </select>
                </label>
              )}
              <button className="btn" onClick={() => void doTakeover()}>Switch</button>
            </div>
          </div>
        )}

        {needsWindow && (
          <p className="notice">
            {info.is_superadmin ? 'Choose a window above before serving in this department.' : <>You have no window yet. <Link to={`/choose-section/${info.section_kind}`}>Choose your window</Link> to start serving.</>}
          </p>
        )}

        <div className="tiles">
          <div className="tile tile-serving">
            <div className="tile-label">Now serving</div>
            <div className="tile-number" key={`s-${serving ?? 'none'}`}>{serving ?? '-'}</div>
            <p className="muted">{serving ? (q?.serving_department_name && q.serving_department_id !== deptId ? `From ${q.serving_department_name}` : 'In consultation') : 'Nobody is being served'}</p>
          </div>
          <div className="tile">
            <div className="tile-label">Next up</div>
            <div className="tile-number" key={`n-${q?.next_up?.queue_number ?? 'none'}`}>{q?.next_up?.queue_number ?? '-'}</div>
            <p className="muted">
              {q?.next_up
                ? `${q.next_up.category}${q.next_up.source === 'pool' ? `, from ${q.next_up.department_name}` : q.next_up.source === 'dental' ? ', dental lane' : ''}`
                : 'Nobody is waiting today'}
            </p>
          </div>
          <div className="tile">
            <div className="tile-label">Today</div>
            <div className="stat-line"><span>Waiting now</span><strong>{q?.waiting_total ?? 0}</strong></div>
            <div className="stat-line" title="Every ticket that was in this queue today, including ones transferred in or sent elsewhere."><span>Patients today</span><strong>{q?.patients_today ?? 0}</strong></div>
            <div className="stat-line"><span>Finished today</span><strong>{q?.finished_today ?? 0}</strong></div>
          </div>
        </div>

        <div className="actions-bar">
          <button className="btn btn-primary btn-lg" disabled={busy || !!serving} title={finishFirstHint} onClick={() => void act('/serve-next', { department_id: deptId }, (r) => (r.message ? r.message : `Now serving ${r.queue_number}${r.pool ? ' (from another clinic)' : ''}.`))}>
            Serve next
          </button>
          <button className="btn btn-lg" disabled={busy || !serving} onClick={() => void act('/repeat-call', { department_id: deptId, queue_number: serving, department_name: q?.active_window ?? info.department_name }, () => `Repeating the call for ${serving}.`)}>
            Repeat call
          </button>
          <button className="btn btn-lg" disabled={busy || !serving} onClick={() => void act('/queue-action', { action: 'hold', queue_id: q?.serving_row_id }, () => `${serving} is on hold.`)}>
            Hold
          </button>
          <button className="btn btn-lg" disabled={busy || !serving} onClick={() => void openTransfer()}>
            Transfer
          </button>
          <button className="btn btn-lg" disabled={busy || !serving} onClick={() => void act('/finish', { department_id: deptId }, () => `${serving} finished.`)}>
            Finished
          </button>
        </div>

        {info.is_laboratory && (
          <form
            className="card filters"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await act('/prioritize', { code: returnCode })) {
                setReturnCode('');
              }
            }}
          >
            <label className="field">
              <span>Returning patient: return code on the ticket</span>
              <input value={returnCode} onChange={(e) => setReturnCode(e.target.value.toUpperCase())} maxLength={10} placeholder="e.g. X7K2" />
            </label>
            <button className="btn" disabled={busy || returnCode.trim() === ''}>Re-queue as priority</button>
          </form>
        )}

        {unattendedCount > 0 && (
          <p className="notice">
            {unattendedCount === 1 ? '1 patient is' : `${unattendedCount} patients are`} unattended: their staffer signed out while serving them.
            Take them over if they are still with you, or return them to the queue in their original place.
          </p>
        )}

        <div>
          <div className="card-head">
            <h2 className="grow">Queue</h2>
            <span className="muted">Today's tickets</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Number</th><th>Type</th><th>Status</th><th>Issued</th><th>Issued by</th><th className="right">Actions</th></tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={6} className="empty">No tickets from today are in this queue.</td></tr>
                )}
                {rows.map((row) => (
                  <tr key={row.id} className={row.unattended ? 'is-unattended' : row.status === 'serving' ? 'is-serving' : ''}>
                    <td><strong>{row.queue_number}</strong></td>
                    <td><CategoryBadge category={row.category} /></td>
                    <td>
                      {row.unattended ? <span className="badge status-unattended">Unattended</span> : <StatusBadge status={row.status} />}{' '}
                      {row.is_returning && <span className="badge badge-returning">Returning</span>}
                      {row.unattended && (
                        <div className="muted" style={{ fontSize: '0.8rem' }}>
                          {row.unattended_by_name ? `${row.unattended_by_name} signed out` : 'Their staffer signed out'}
                          {row.department_name && row.department_name !== info.department_name ? `, ${row.department_name}` : ''}
                        </div>
                      )}
                    </td>
                    <td>
                      {formatDateTime(row.created_at)}
                      {row.transferred_at && (
                        <div className="muted" style={{ fontSize: '0.8rem' }}>
                          Transferred{row.transferred_from_name ? ` from ${row.transferred_from_name}` : ''} {formatDateTime(row.transferred_at)}
                        </div>
                      )}
                    </td>
                    <td>{row.issued_by_name || <span className="muted">Kiosk</span>}</td>
                    <td className="right nowrap">
                      {row.unattended && (
                        <>
                          <button className="btn btn-sm" disabled={busy || !!serving} title={finishFirstHint} onClick={() => void act('/queue-action', { action: 'takeover', queue_id: row.id })}>Take over</button>{' '}
                          <button
                            className="btn btn-sm"
                            disabled={busy}
                            onClick={() => window.confirm(`Return ${row.queue_number} to the queue? They keep their original place in line.`) && void act('/queue-action', { action: 'return', queue_id: row.id })}
                          >
                            Return to queue
                          </button>
                        </>
                      )}
                      {row.status === 'waiting' && (
                        <>
                          <button className="btn btn-sm" disabled={busy || !!serving} title={finishFirstHint} onClick={() => setApproveRow(row)}>Serve</button>{' '}
                          <button className="btn btn-sm" disabled={busy} onClick={() => void act('/queue-action', { action: 'hold', queue_id: row.id })}>Hold</button>{' '}
                        </>
                      )}
                      {row.status === 'hold' && (
                        <>
                          <button className="btn btn-sm" disabled={busy} onClick={() => void act('/queue-action', { action: 'unhold', queue_id: row.id })}>Unhold</button>{' '}
                        </>
                      )}
                      {(row.status === 'waiting' || row.status === 'hold') && (
                        <button className="btn btn-sm" disabled={busy} onClick={() => window.confirm(`Remove ${row.queue_number} from the queue?`) && void act('/queue-action', { action: 'remove', queue_id: row.id })}>Remove</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {info.in_pool_clinic && pool && (
          <div className="card">
            <div className="card-head">
              <h2 className="grow">Mutual help: other clinics</h2>
            </div>
            {serving && <p className="notice" style={{ marginBottom: '0.75rem' }}>Finish or transfer {serving} before pulling a patient from another clinic.</p>}
            {!serving && !pool.mine_free && <p className="notice" style={{ marginBottom: '0.75rem' }}>Your clinic still has {pool.mine_waiting} waiting. Serve them before pulling from another clinic.</p>}
            {pool.pool.length === 0 && <p className="muted">The other clinics have nobody waiting.</p>}
            {pool.pool.map((clinic: Record<string, any>) => (
              <div key={clinic.id} style={{ marginBottom: '0.75rem' }}>
                <h3>{clinic.name}</h3>
                <div className="row" style={{ marginTop: '0.4rem' }}>
                  {clinic.rows.map((r: Record<string, any>) => (
                    <button key={r.id} className="btn btn-sm" disabled={!pool.mine_free || busy || !!serving} onClick={() => setPoolPick({ department_id: clinic.id, queue_id: r.id, queue_number: r.queue_number })}>
                      {r.queue_number} <CategoryBadge category={r.category} />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {transferTargets && (
        <Modal title="Transfer patient" onClose={() => setTransferTargets(null)} wide>
          <p className="muted" style={{ marginBottom: '0.75rem' }}>
            {serving ? `Moving ${serving} from ${q?.serving_department_name ?? 'this department'}. Pick the destination.` : 'No patient is currently being served.'}
          </p>
          <div className="transfer-grid">
            {targets.map((t) => (
              <button
                key={t.id}
                className="transfer-tile"
                disabled={t.disabled || busy || !serving}
                onClick={async () => {
                  if (await act('/transfer', { department_id: t.id }, (r) => (r.renumbered_to ? r.message : `${r.queue_code} transferred to ${t.name}.`))) {
                    setTransferTargets(null);
                  }
                }}
              >
                <strong>{t.name}</strong>
                <span className="muted">{t.waiting} waiting</span>
                {shortest.includes(t.id) && <div><span className="badge status-serving">Shortest queue</span></div>}
                {t.disabled && <div className="muted" style={{ fontSize: '0.8rem' }}>Not for general tickets</div>}
              </button>
            ))}
          </div>
        </Modal>
      )}

      {approveRow && (
        <PasswordPrompt
          title={`Serve ${approveRow.queue_number} out of turn`}
          hint="Calling a specific patient ahead of the line needs a physician or admin to enter their password."
          confirmLabel="Approve and serve"
          onClose={() => setApproveRow(null)}
          onSubmit={async (password) => {
            if (await act('/queue-action', { action: 'serve', queue_id: approveRow.id, approver_password: password }, (r) => `Now serving ${r.queue_number}.`)) {
              setApproveRow(null);
            }
          }}
        />
      )}

      {poolPick && (
        <PasswordPrompt
          title={`Pull ${poolPick.queue_number} into your clinic`}
          hint="Enter your own password to confirm taking this patient from another clinic."
          confirmLabel="Serve this patient"
          onClose={() => setPoolPick(null)}
          onSubmit={async (password) => {
            if (await act('/serve-pool', { department_id: poolPick.department_id, queue_id: poolPick.queue_id, password })) {
              setPoolPick(null);
            }
          }}
        />
      )}

      {changePw && (
        <Modal title="Change your password" onClose={() => setChangePw(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const result = await api('/update-password', { body: { new_password: newPw } });
              toast(result.success ? 'Password changed.' : (result.message ?? 'Could not change the password.'), result.success ? 'success' : 'error');
              if (result.success) {
                setChangePw(false);
              }
            }}
          >
            <p className="muted">You are still using the default password. Set your own now.</p>
            <label className="field">
              <span>New password (5 characters or more)</span>
              <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" autoFocus />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setChangePw(false)}>Later</button>
              <button className="btn btn-primary" disabled={newPw.length < 5}>Save password</button>
            </div>
          </form>
        </Modal>
      )}
    </Layout>
  );
}
