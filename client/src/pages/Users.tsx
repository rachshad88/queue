import { useState } from 'react';
import { api, query } from '../api';
import { Layout } from '../components/Layout';
import { Modal, Pagination, useApi, useToast } from '../components/ui';
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
                    <button className="btn btn-sm" onClick={() => setEditing({ id: u.user_id, form: { ...BLANK, ...u, department: String(u.department_id ?? ''), password: '' } })}>Edit</button>{' '}
                    {(data?.activity_by_user?.[u.user_id]?.length ?? 0) > 0 && <><button className="btn btn-sm" onClick={() => setActivityFor(u)}>Activity</button>{' '}</>}
                    {isAdmin && u.user_id !== data?.user_id && (
                      <>
                        <button className="btn btn-sm" onClick={() => void op(u, 'force-logout', `Sign ${u.username} out of their device?`)}>Sign out</button>{' '}
                        <button className="btn btn-sm" onClick={() => void op(u, u.status === 'active' ? 'deactivate' : 'activate')}>{u.status === 'active' ? 'Deactivate' : 'Activate'}</button>{' '}
                        <button className="btn btn-sm btn-danger" onClick={() => void op(u, 'delete', `Delete ${u.username}? This cannot be undone.`)}>Delete</button>
                      </>
                    )}
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
