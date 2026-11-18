import { useState } from 'react';
import { api, query } from '../api';
import { stepLabel } from '../components/Journey';
import { Layout } from '../components/Layout';
import { PasswordForm, ProfileForm } from './Account';
import { Modal, Pagination, useApi, useToast } from '../components/ui';
import { useQueryClient } from '@tanstack/react-query';
import { formatDateTime } from '../format';

const DEFAULT_FILTERS = { q: '', department: '', online: '', page: 1 };
/** What the page asks for when first opened (prefetched after sign-in). */
export const USERS_PATH = `/users${query(DEFAULT_FILTERS)}`;

interface User {
  user_id: number;
  username: string;
  usertype: string;
  firstname: string;
  middlename: string;
  lastname: string;
  position: string;
  department_id: number | null;
  department_name: string;
  status: string;
  last_login_at: string | null;
  online: boolean;
}

const BLANK = { username: '', usertype: 'staff', firstname: '', middlename: '', lastname: '', position: '', department: '', status: 'active', password: '' };

export function Users() {
  const toast = useToast();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ id: number | null; form: typeof BLANK } | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [activityFor, setActivityFor] = useState<User | null>(null);
  const { data, reload, loading } = useApi(`/users${query(filters)}`);

  const isAdmin = !!data?.is_admin;
  const users: User[] = data?.users ?? [];

  const report = (result: Record<string, any>): void => {
    toast(result.message ?? (result.success ? 'Saved.' : 'That did not work.'), result.success ? 'success' : 'error');
    reload();
  };
  const op = async (user: User, action: string, confirmText?: string): Promise<void> => {
    if (confirmText && !window.confirm(confirmText)) {
      return;
    }
    report(await api(`/users/${user.user_id}/${action}`, { method: 'POST' }));
  };
  const bulk = async (action: string): Promise<void> => {
    if (!window.confirm(`Apply "${action}" to ${selected.length} selected user(s)?`)) {
      return;
    }
    report(await api('/users/bulk', { body: { op: action, ids: selected } }));
    setSelected([]);
  };
  const save = async (): Promise<void> => {
    if (!editing) {
      return;
    }
    const result = editing.id === null ? await api('/users', { body: editing.form }) : await api(`/users/${editing.id}`, { method: 'PUT', body: editing.form });
    report(result);
    if (result.success) {
      setEditing(null);
    }
  };
  const set = (key: keyof typeof BLANK, value: string): void => setEditing((e) => (e ? { ...e, form: { ...e.form, [key]: value } } : e));

  if (data && !isAdmin) {
    return <MyRecord me={users[0] ?? null} activity={users[0] ? (data.activity_by_user?.[users[0].user_id] ?? []) : []} onSaved={reload} />;
  }

  return (
    <Layout title={isAdmin ? 'Users' : 'My user record'} actions={isAdmin && <button className="btn btn-primary" onClick={() => setEditing({ id: null, form: BLANK })}>Add user</button>}>
      <div className="stack">
        {isAdmin && (
          <form
            className="filters"
            onSubmit={(e) => {
              e.preventDefault();
              setFilters((f) => ({ ...f, q: search, page: 1 }));
            }}
          >
            <label className="field"><span>Search</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or username" /></label>
            <label className="field">
              <span>Department</span>
              <select value={filters.department} onChange={(e) => setFilters((f) => ({ ...f, department: e.target.value, page: 1 }))}>
                <option value="">All departments</option>
                {(data?.departments ?? []).map((d: { id: number; name: string }) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Status</span>
              <select value={filters.online} onChange={(e) => setFilters((f) => ({ ...f, online: e.target.value, page: 1 }))}>
                <option value="">Online and offline</option>
                <option value="online">Online now</option>
                <option value="offline">Offline</option>
              </select>
            </label>
            <button className="btn">Search</button>
            {selected.length > 0 && (
              <span className="row">
                <button type="button" className="btn btn-sm" onClick={() => void bulk('activate')}>Activate</button>
                <button type="button" className="btn btn-sm" onClick={() => void bulk('deactivate')}>Deactivate</button>
                <button type="button" className="btn btn-sm btn-danger" onClick={() => void bulk('delete')}>Delete</button>
              </span>
            )}
          </form>
        )}
        {isAdmin && <AccountRequests departments={data?.departments ?? []} roles={data?.roles ?? []} onDone={reload} />}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>{isAdmin && <th></th>}<th>Username</th><th>Name</th><th>Role</th><th>Department</th><th>Status</th><th>Last login</th><th className="right">Actions</th></tr>
            </thead>
            <tbody>
              {!loading && users.length === 0 && <tr><td colSpan={8} className="empty">No users match.</td></tr>}
              {users.map((u) => (
                <tr key={u.user_id}>
                  {isAdmin && (
                    <td><input type="checkbox" aria-label={`Select ${u.username}`} checked={selected.includes(u.user_id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, u.user_id] : s.filter((id) => id !== u.user_id)))} /></td>
                  )}
                  <td><strong>{u.username}</strong> {u.online && <span className="badge badge-online">Online</span>}</td>
                  <td>{u.firstname} {u.lastname}<div className="muted" style={{ fontSize: '0.8rem' }}>{u.position}</div></td>
                  <td>{u.usertype}</td>
                  <td>{u.department_name}</td>
                  <td><span className={`badge ${u.status === 'active' ? 'state-ok' : 'status-inactive'}`}>{u.status}</span></td>
                  <td className="nowrap">{formatDateTime(u.last_login_at) || <span className="muted">Never</span>}</td>
                  <td className="right nowrap">
                    <div className="row-actions">
                    <button className="btn btn-sm" onClick={() => setEditing({ id: u.user_id, form: { ...BLANK, ...u, department: String(u.department_id ?? ''), password: '' } })}>Edit</button>
                    {(data?.activity_by_user?.[u.user_id]?.length ?? 0) > 0 && <><button className="btn btn-sm" onClick={() => setActivityFor(u)}>Activity</button></>}
                    {isAdmin && u.user_id !== data?.user_id && (
                      <>
                        <button className="btn btn-sm" onClick={() => void op(u, 'force-logout', `Sign ${u.username} out of their device?`)}>Sign out</button>
                        <button className="btn btn-sm" onClick={() => void op(u, u.status === 'active' ? 'deactivate' : 'activate')}>{u.status === 'active' ? 'Deactivate' : 'Activate'}</button>
                        <button className="btn btn-sm btn-danger" onClick={() => void op(u, 'delete', `Delete ${u.username}? This cannot be undone.`)}>Delete</button>
                      </>
                    )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data?.paging && <Pagination paging={data.paging} onPage={(page) => setFilters((f) => ({ ...f, page }))} />}
      </div>

      {editing && (
        <Modal title={editing.id === null ? 'Add user' : 'Edit user'} onClose={() => setEditing(null)} wide>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="form-grid">
              <label className="field"><span>Username</span><input value={editing.form.username} onChange={(e) => set('username', e.target.value)} maxLength={50} pattern="[\p{L}\p{N}._@\-]+" title="Letters, numbers and . _ @ - (no spaces)" required /></label>
              <label className="field"><span>First name</span><input value={editing.form.firstname} onChange={(e) => set('firstname', e.target.value)} maxLength={60} required /></label>
              <label className="field"><span>Middle name</span><input value={editing.form.middlename} onChange={(e) => set('middlename', e.target.value)} maxLength={60} /></label>
              <label className="field"><span>Last name</span><input value={editing.form.lastname} onChange={(e) => set('lastname', e.target.value)} maxLength={60} required /></label>
              <label className="field"><span>Position</span><input value={editing.form.position} onChange={(e) => set('position', e.target.value)} maxLength={60} /></label>
              {isAdmin && (
                <>
                  <label className="field">
                    <span>Role</span>
                    <select value={editing.form.usertype} onChange={(e) => set('usertype', e.target.value)}>
                      {(data?.roles ?? []).map((r: string) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </label>
                  <label className="field">
                    <span>Department</span>
                    <select value={editing.form.department} onChange={(e) => set('department', e.target.value)}>
                      <option value="">None</option>
                      {(data?.departments ?? []).map((d: { id: number; name: string }) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </label>
                </>
              )}
              {isAdmin && editing.id !== null && (
                <label className="field">
                  <span>Status</span>
                  <select value={editing.form.status} onChange={(e) => set('status', e.target.value)}>
                    <option value="active">active</option>
                    <option value="inactive">inactive</option>
                  </select>
                </label>
              )}
              {editing.id !== null && (
                <label className="field"><span>New password (leave blank to keep)</span><input type="password" value={editing.form.password} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" minLength={5} maxLength={72} /></label>
              )}
            </div>
            {editing.id === null && <p className="muted">New users start with the default password and are asked to change it at first sign in.</p>}
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-primary">Save</button>
            </div>
          </form>
        </Modal>
      )}

      {activityFor && (
        <Modal title={`Recent activity: ${activityFor.username}`} onClose={() => setActivityFor(null)}>
          <table>
            <tbody>
              {(data?.activity_by_user?.[activityFor.user_id] ?? []).map((a: { q: string; a: string; dt: string }, i: number) => (
                <tr key={i}><td><strong>{a.q}</strong></td><td>{a.a}</td><td className="nowrap">{formatDateTime(a.dt)}</td></tr>
              ))}
            </tbody>
          </table>
        </Modal>
      )}
    </Layout>
  );
}

const initials = (u: User): string => `${u.firstname?.[0] ?? ''}${u.lastname?.[0] ?? ''}`.toUpperCase() || u.username.slice(0, 2).toUpperCase();

/** A staffer's own record on one screen: who they are, their details to edit, their password, and what they did lately. */
function MyRecord({ me, activity, onSaved }: { me: User | null; activity: { q: string; a: string; dt: string }[]; onSaved: () => void }) {
  return (
    <Layout title="My user record">
      <div className="stack my-record">
        {me && (
          <section className="card my-record-head">
            <span className="my-record-avatar" aria-hidden="true">{initials(me)}</span>
            <div className="my-record-who">
              <h2>{[me.firstname, me.middlename, me.lastname].filter(Boolean).join(' ')}</h2>
              <p className="muted">{me.position || 'No position set'} · @{me.username}</p>
            </div>
            <dl className="my-record-facts">
              <div><dt>Department</dt><dd>{me.department_name || '—'}</dd></div>
              <div><dt>Role</dt><dd>{me.usertype}</dd></div>
              <div><dt>Status</dt><dd><span className={`badge ${me.status === 'active' ? 'state-ok' : 'status-inactive'}`}>{me.status}</span> {me.online && <span className="badge badge-online">Online</span>}</dd></div>
              <div><dt>Last sign-in</dt><dd>{formatDateTime(me.last_login_at) || 'Never'}</dd></div>
            </dl>
          </section>
        )}
        <div className="my-record-forms">
          <ProfileForm onSaved={onSaved} />
          <PasswordForm />
        </div>
        <section className="card">
          <div className="card-head"><h2>My recent activity</h2><span className="muted">Latest {activity.length || ''} actions</span></div>
          {activity.length === 0 ? (
            <p className="muted">Nothing yet. Patients you call, serve or transfer will show here.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Ticket</th><th>What you did</th><th>When</th></tr></thead>
                <tbody>
                  {activity.map((a, i) => (
                    <tr key={i}><td><strong>{a.q}</strong></td><td>{stepLabel(a.a)}</td><td className="nowrap">{formatDateTime(a.dt)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
}

type AccountRequest = { id: string; username: string; firstname: string; middlename: string; lastname: string; position: string; department_id: number | null; requested_at: string };

/** Admins: staff who asked for an account. Confirm the department, pick the role, then approve or reject. */
function AccountRequests({ departments, roles, onDone }: { departments: { id: number; name: string }[]; roles: string[]; onDone: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data, reload } = useApi<{ success: boolean; requests?: AccountRequest[] }>('/account-requests');
  const [choices, setChoices] = useState<Record<string, { department: string; usertype: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const requests = data?.requests ?? [];
  if (requests.length === 0) {
    return null;
  }

  const choice = (r: AccountRequest) => choices[r.id] ?? { department: String(r.department_id ?? ''), usertype: 'staff' };
  const choose = (r: AccountRequest, patch: Partial<{ department: string; usertype: string }>): void => setChoices((c) => ({ ...c, [r.id]: { ...choice(r), ...patch } }));
  const finish = (result: Record<string, any>): void => {
    toast(result.message ?? (result.success ? 'Done.' : 'That did not work.'), result.success ? 'success' : 'error');
    reload();
    onDone();
    void queryClient.invalidateQueries({ queryKey: ['api', '/account-requests'] });
  };
  const approve = async (r: AccountRequest): Promise<void> => {
    setBusy(r.id);
    finish(await api(`/account-requests/${r.id}/approve`, { body: choice(r) }));
    setBusy(null);
  };
  const reject = async (r: AccountRequest): Promise<void> => {
    const reason = window.prompt(`Why are you rejecting ${r.username}? They will see this reason.`, '');
    if (reason === null) {
      return;
    }
    setBusy(r.id);
    finish(await api(`/account-requests/${r.id}/reject`, { body: { reason } }));
    setBusy(null);
  };

  return (
    <section className="card account-requests">
      <div className="card-head"><h2>Account requests</h2><span className="badge badge-online">{requests.length} waiting</span></div>
      <p className="muted">Approved accounts start on the default password; the staffer is asked to change it at first sign-in.</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Username</th><th>Department</th><th>Role</th><th>Requested</th><th className="right">Decision</th></tr></thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id}>
                <td><strong>{[r.firstname, r.middlename, r.lastname].filter(Boolean).join(' ')}</strong><div className="muted" style={{ fontSize: '0.8rem' }}>{r.position || 'No position given'}</div></td>
                <td>{r.username}</td>
                <td>
                  <select aria-label={`Department for ${r.username}`} value={choice(r).department} onChange={(e) => choose(r, { department: e.target.value })}>
                    <option value="">None</option>
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </td>
                <td>
                  <select aria-label={`Role for ${r.username}`} value={choice(r).usertype} onChange={(e) => choose(r, { usertype: e.target.value })}>
                    {roles.map((role) => <option key={role} value={role}>{role}</option>)}
                  </select>
                </td>
                <td className="nowrap">{formatDateTime(r.requested_at)}</td>
                <td className="right nowrap">
                  <div className="row-actions">
                    <button className="btn btn-sm btn-primary" disabled={busy === r.id} onClick={() => void approve(r)}>Approve</button>
                    <button className="btn btn-sm btn-danger" disabled={busy === r.id} onClick={() => void reject(r)}>Reject</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
