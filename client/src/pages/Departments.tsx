import { useState } from 'react';
import { api, query } from '../api';
import { Layout } from '../components/Layout';
import { Modal, Pagination, useApi, useToast } from '../components/ui';

const DEFAULT_FILTERS = { q: '', page: 1 };
/** What the page asks for when first opened (prefetched after sign-in). */
export const DEPARTMENTS_PATH = `/department-management${query(DEFAULT_FILTERS)}`;

const BLANK = { name: '', prefix: '', server: '', status: 'active' };

export function Departments() {
  const toast = useToast();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ id: number | null; form: typeof BLANK } | null>(null);
  const { data, reload, loading } = useApi(`/department-management${query(filters)}`);

  const save = async (): Promise<void> => {
    if (!editing) {
      return;
    }
    const result = editing.id === null ? await api('/department-management', { body: editing.form }) : await api(`/department-management/${editing.id}`, { method: 'PUT', body: editing.form });
    toast(result.message ?? 'Saved.', result.success ? 'success' : 'error');
    if (result.success) {
      setEditing(null);
      reload();
    }
  };
  const set = (key: keyof typeof BLANK, value: string): void => setEditing((e) => (e ? { ...e, form: { ...e.form, [key]: value } } : e));

  return (
    <Layout title="Departments" actions={<button className="btn btn-primary" onClick={() => setEditing({ id: null, form: BLANK })}>Add department</button>}>
      <div className="stack">
        <form
          className="filters"
          onSubmit={(e) => {
            e.preventDefault();
            setFilters({ q: search, page: 1 });
          }}
        >
          <label className="field"><span>Search</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or prefix" /></label>
          <button className="btn">Search</button>
        </form>
        <div className="table-wrap">
          <table>
            <thead><tr><th>ID</th><th>Name</th><th>Prefix</th><th>Server / physician</th><th>Status</th><th className="right">Actions</th></tr></thead>
            <tbody>
              {!loading && (data?.departments ?? []).length === 0 && <tr><td colSpan={6} className="empty">No departments match.</td></tr>}
              {(data?.departments ?? []).map((d: Record<string, any>) => (
                <tr key={d.id}>
                  <td>{d.id}</td>
                  <td><strong>{d.name}</strong></td>
                  <td>{d.prefix}</td>
                  <td>{d.server}</td>
                  <td><span className={`badge ${d.status === 'inactive' ? 'status-inactive' : 'state-ok'}`}>{d.status}</span></td>
                  <td className="right"><button className="btn btn-sm" onClick={() => setEditing({ id: d.id, form: { name: d.name, prefix: d.prefix, server: d.server ?? '', status: d.status } })}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data?.paging && <Pagination paging={data.paging} onPage={(page) => setFilters((f) => ({ ...f, page }))} />}
        <p className="muted">Department names drive queue rules: "Admission" and "Waiting" departments use windows, and "ABTC", "Dental" and "Laboratory" have their own ticket behaviour.</p>
      </div>
      {editing && (
        <Modal title={editing.id === null ? 'Add department' : 'Edit department'} onClose={() => setEditing(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <label className="field"><span>Name</span><input value={editing.form.name} onChange={(e) => set('name', e.target.value)} maxLength={60} required /></label>
            <label className="field"><span>Prefix</span><input value={editing.form.prefix} onChange={(e) => set('prefix', e.target.value)} maxLength={6} required /></label>
            <label className="field"><span>Server / physician name</span><input value={editing.form.server} onChange={(e) => set('server', e.target.value)} maxLength={100} /></label>
            <label className="field">
              <span>Status</span>
              <select value={editing.form.status} onChange={(e) => set('status', e.target.value)}>
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </select>
            </label>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-primary">Save</button>
            </div>
          </form>
        </Modal>
      )}
    </Layout>
  );
}
