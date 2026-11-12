import { useState } from 'react';
import { api, query } from '../api';
import { BASE } from '../base';
import { Layout } from '../components/Layout';
import { CategoryBadge, Pagination, StatusBadge, useLoader } from '../components/ui';
import { formatDateTime } from '../format';

const BLANK = { department: '', sid: '', from: '', to: '', q: '', sort: '', dir: 'asc', page: 1 };
const COLUMNS: [string, string][] = [['num', 'Queue number'], ['server', 'Served by'], ['department', 'Department'], ['category', 'Type'], ['status', 'Status'], ['datetime', 'Issued']];

/** Every ticket that was served, and by whom. */
export function ServerHistory() {
  const [filters, setFilters] = useState(BLANK);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<number[]>([]);
  const { data } = useLoader(() => api(`/server-history${query(filters)}`), [filters]);
  const change = (patch: Partial<typeof BLANK>): void => setFilters((f) => ({ ...f, ...patch, page: 1 }));
  const sortBy = (key: string): void => setFilters((f) => ({ ...f, sort: key, dir: f.sort === key && f.dir === 'asc' ? 'desc' : 'asc', page: 1 }));
  const exportUrl = (extra: Record<string, string | number>): string => `${BASE}/api/server-history${query({ ...filters, export: 'csv', ...extra })}`;

  return (
    <Layout
      title="Queue list"
      actions={
        <>
          <a className="btn btn-sm" href={exportUrl({})} style={{ textDecoration: 'none' }}>Export all (CSV)</a>
          <a className="btn btn-sm" href={exportUrl({ scope: 'page' })} style={{ textDecoration: 'none' }}>Export this page</a>
          {selected.length > 0 && <a className="btn btn-sm" href={exportUrl({ scope: 'selected', ids: selected.join(',') })} style={{ textDecoration: 'none' }}>Export {selected.length} selected</a>}
        </>
      }
    >
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
            <select value={filters.department} onChange={(e) => change({ department: e.target.value, sid: '' })}>
              <option value="">All</option>
              {(data?.departments ?? []).map((d: { id: number; name: string }) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Served by</span>
            <select value={filters.sid} onChange={(e) => change({ sid: e.target.value })}>
              <option value="">Anyone</option>
              {(data?.servers ?? []).map((s: { id: number; name: string }) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="field"><span>From</span><input type="date" value={filters.from || data?.from || ''} max={data?.today} onChange={(e) => change({ from: e.target.value, to: filters.to || data?.to || '' })} /></label>
          <label className="field"><span>To</span><input type="date" value={filters.to || data?.to || ''} max={data?.today} onChange={(e) => change({ to: e.target.value, from: filters.from || data?.from || '' })} /></label>
          <label className="field"><span>Queue number</span><input value={search} onChange={(e) => setSearch(e.target.value)} /></label>
          <button className="btn">Search</button>
          <button type="button" className="btn" onClick={() => { setSearch(''); setFilters(BLANK); }}>Today only</button>
        </form>
        {data?.last_updated_at && <p className="muted">Latest served ticket was issued {formatDateTime(data.last_updated_at)}.</p>}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th></th>
                {COLUMNS.map(([key, label]) => (
                  <th key={key} aria-sort={filters.sort === key ? (filters.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button onClick={() => sortBy(key)}>{label}{filters.sort === key ? (filters.dir === 'asc' ? ' (A to Z)' : ' (Z to A)') : ''}</button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data?.records ?? []).length === 0 && <tr><td colSpan={7} className="empty">No served tickets for this filter.</td></tr>}
              {(data?.records ?? []).map((r: Record<string, any>) => (
                <tr key={r.id}>
                  <td><input type="checkbox" aria-label={`Select ${r.queue_number}`} checked={selected.includes(r.id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, r.id] : s.filter((id) => id !== r.id)))} /></td>
                  <td><strong>{r.queue_number}</strong></td>
                  <td>{r.server_name}</td>
                  <td>{r.department}</td>
                  <td><CategoryBadge category={r.category} /></td>
                  <td><StatusBadge status={r.status} /></td>
                  <td className="nowrap">{formatDateTime(r.created_at)}</td>
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
