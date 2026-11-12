import { useState } from 'react';
import { api, query } from '../api';
import { Layout } from '../components/Layout';
import { Pagination, useLoader } from '../components/ui';
import { formatDateTime } from '../format';

const BLANK = { department: '', action: '', uid: '', from: '', to: '', q: '', page: 1 };

export function QueueLogs() {
  const [filters, setFilters] = useState(BLANK);
  const [search, setSearch] = useState('');
  const { data } = useLoader(() => api(`/queue-logs${query(filters)}`), [filters]);
  const change = (patch: Partial<typeof BLANK>): void => setFilters((f) => ({ ...f, ...patch, page: 1 }));

  return (
    <Layout title="Queue logs">
      <div className="stack">
        <form
          className="filters"
          onSubmit={(e) => {
            e.preventDefault();
            change({ q: search });
          }}
        >
          <label className="field">
            <span>Department</span>
            <select value={filters.department} onChange={(e) => change({ department: e.target.value })}>
              <option value="">All</option>
              {(data?.departments ?? []).map((d: { id: number; name: string }) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Action</span>
            <select value={filters.action} onChange={(e) => change({ action: e.target.value })}>
              <option value="">All</option>
              {(data?.actions ?? []).map((a: string) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Operator</span>
            <select value={filters.uid} onChange={(e) => change({ uid: e.target.value })}>
              <option value="">All</option>
              {(data?.operators ?? []).map((o: { uid: number; name: string }) => <option key={o.uid} value={o.uid}>{o.name}</option>)}
            </select>
          </label>
          <label className="field"><span>From</span><input type="date" value={filters.from || data?.from || ''} max={data?.today} onChange={(e) => change({ from: e.target.value, to: filters.to || data?.to || '' })} /></label>
          <label className="field"><span>To</span><input type="date" value={filters.to || data?.to || ''} max={data?.today} onChange={(e) => change({ to: e.target.value, from: filters.from || data?.from || '' })} /></label>
          <label className="field"><span>Queue number</span><input value={search} onChange={(e) => setSearch(e.target.value)} /></label>
          <button className="btn">Search</button>
          <button type="button" className="btn" onClick={() => { setSearch(''); setFilters(BLANK); }}>Today only</button>
        </form>
        <div className="table-wrap">
          <table>
            <thead><tr><th>When</th><th>Queue number</th><th>Action</th><th>Change</th><th>Department</th><th>Operator</th><th>Device IP</th></tr></thead>
            <tbody>
              {(data?.records ?? []).length === 0 && <tr><td colSpan={7} className="empty">No log entries for this filter.</td></tr>}
              {(data?.records ?? []).map((r: Record<string, any>) => (
                <tr key={r.id}>
                  <td className="nowrap">{formatDateTime(r.created_at)}</td>
                  <td><strong>{r.queue_number}</strong></td>
                  <td>{r.action}</td>
                  <td>{r.old_status ?? ''}{r.new_status ? ` to ${r.new_status}` : ''}</td>
                  <td>{r.department}</td>
                  <td>{r.operator_name || <span className="muted">System</span>}</td>
                  <td>{r.client_ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data?.paging && <Pagination paging={data.paging} onPage={(page) => setFilters((f) => ({ ...f, page }))} />}
      </div>
    </Layout>
  );
}
