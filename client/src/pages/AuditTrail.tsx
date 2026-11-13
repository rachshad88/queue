import { useState } from 'react';
import { query } from '../api';
import { Layout } from '../components/Layout';
import { Pagination, useApi } from '../components/ui';
import { formatDateTime } from '../format';

const DEFAULT_FILTERS = { department: '', search: '', page: 1 };
/** What the page asks for when first opened (prefetched after sign-in). */
export const AUDIT_TRAIL_PATH = `/audit-trail${query(DEFAULT_FILTERS)}`;

/** Follow one queue number through every action taken on it. */
export function AuditTrail() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [draft, setDraft] = useState(filters);
  const { data, loading } = useApi(`/audit-trail${query(filters)}`);

  return (
    <Layout title="Audit trail">
      <div className="stack">
        <form
          className="filters"
          onSubmit={(e) => {
            e.preventDefault();
            setFilters({ ...draft, page: 1 });
          }}
        >
          <label className="field">
            <span>Department</span>
            <select value={draft.department} onChange={(e) => setDraft((d) => ({ ...d, department: e.target.value }))}>
              <option value="">Choose</option>
              <option value="all">All departments</option>
              {(data?.departments ?? []).map((d: { id: number; name: string }) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <label className="field"><span>Queue number</span><input value={draft.search} onChange={(e) => setDraft((d) => ({ ...d, search: e.target.value }))} placeholder="e.g. R-012" /></label>
          <button className="btn btn-primary">Show trail</button>
        </form>
        {!data?.has_filter ? (
          <p className="card muted">Choose a department or type a queue number to see its history.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Queue number</th><th>Action</th><th>Department</th><th>Operator</th><th>When</th></tr></thead>
              <tbody>
                {(data.rows ?? []).length === 0 && <tr><td colSpan={5} className="empty">{loading ? 'Loading' : 'Nothing recorded for that filter.'}</td></tr>}
                {(data.rows ?? []).map((r: Record<string, any>) => (
                  <tr key={r.id}><td><strong>{r.queue_number}</strong></td><td>{r.action}</td><td>{r.department}</td><td>{r.operator || <span className="muted">System</span>}{r.approved_by && <div className="muted" style={{ fontSize: '0.8rem' }}>Approved by {r.approved_by}</div>}</td><td className="nowrap">{formatDateTime(r.created_at)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data?.has_filter && data.paging?.total_pages > 1 && <Pagination paging={data.paging} onPage={(page) => setFilters((f) => ({ ...f, page }))} />}
      </div>
    </Layout>
  );
}
