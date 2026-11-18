import { useState } from 'react';
import { query } from '../api';
import { JourneyModal } from '../components/Journey';
import { Layout } from '../components/Layout';
import { CategoryBadge, Pagination, StatusBadge, useApi } from '../components/ui';
import { formatDateTime } from '../format';

const BLANK = { from: '', to: '', department: '', q: '', moved: '', page: 1 };
/** What the page asks for when first opened (prefetched after sign-in). */
export const QUEUE_TRAIL_PATH = `/queue-trail${query(BLANK)}`;

type TrailRecord = {
  id: number;
  queue_number: string;
  category: string;
  status: string;
  department: string;
  issued_at: string;
  last_at: string;
  path: string[];
  moves: number;
};

/** A YYYY-MM-DD day as "Nov 18, 2026". */
const formatDay = (day: string): string => new Date(`${day}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });

/** Every ticket of a date range and the departments it went through; a ticket opens its full journey. */
export function QueueTrail() {
  const [filters, setFilters] = useState(BLANK);
  const [search, setSearch] = useState('');
  const [journeyFor, setJourneyFor] = useState<number | null>(null);
  const { data, loading } = useApi(`/queue-trail${query(filters)}`);
  const change = (patch: Partial<typeof BLANK>): void => setFilters((f) => ({ ...f, ...patch, page: 1 }));
  const records: TrailRecord[] = data?.success ? (data.records ?? []) : [];
  const scope = data?.department ? `that have been in ${data.department}` : 'in every department';
  const when = !data?.from || (data.from === data.to && data.from === data.today)
    ? "Today's tickets"
    : data.from === data.to ? `Tickets on ${formatDay(data.from)}` : `Tickets from ${formatDay(data.from)} to ${formatDay(data.to)}`;

  return (
    <Layout title="Queue trail">
      <div className="stack">
        <form
          className="filters"
          onSubmit={(e) => {
            e.preventDefault();
            change({ q: search });
          }}
        >
          <label className="field">
            <span>From</span>
            <input type="date" value={filters.from || data?.from || ''} max={data?.today} onChange={(e) => change({ from: e.target.value, to: filters.to || data?.to || '' })} />
          </label>
          <label className="field">
            <span>To</span>
            <input type="date" value={filters.to || data?.to || ''} max={data?.today} onChange={(e) => change({ to: e.target.value, from: filters.from || data?.from || '' })} />
          </label>
          {data?.can_pick && (
            <label className="field">
              <span>Department</span>
              <select value={filters.department} onChange={(e) => change({ department: e.target.value })}>
                <option value="">All</option>
                {(data.departments ?? []).map((d: { id: number; name: string }) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
          )}
          <label className="field"><span>Queue number</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. R-012" /></label>
          <label className="check-field">
            <input type="checkbox" checked={filters.moved === '1'} onChange={(e) => change({ moved: e.target.checked ? '1' : '' })} />
            Moved between departments only
          </label>
          <button className="btn">Search</button>
          <button type="button" className="btn" onClick={() => { setSearch(''); setFilters(BLANK); }}>Today only</button>
        </form>

        {data && !data.success ? (
          <p className="notice notice-error">{data.message ?? 'The queue trail could not be loaded.'}</p>
        ) : (
          <>
            <p className="muted">
              {when} {scope}. Click a ticket to see every step it took.
            </p>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Ticket</th><th>Type</th><th>Status</th><th>Route</th><th>Now in</th><th>Issued</th><th>Last update</th></tr></thead>
                <tbody>
                  {!loading && records.length === 0 && <tr><td colSpan={7} className="empty">No tickets for this filter.</td></tr>}
                  {records.map((r) => (
                    <tr key={r.id}>
                      <td><button type="button" className="ticket-link" title="See every step of this ticket" onClick={() => setJourneyFor(r.id)}>{r.queue_number}</button></td>
                      <td><CategoryBadge category={r.category} /></td>
                      <td><StatusBadge status={r.status} /></td>
                      <td>
                        <ol className="journey-path journey-path-sm" aria-label={`Route of ${r.queue_number}`}>
                          {r.path.map((name, index) => <li key={`${name}-${index}`} className={index === r.path.length - 1 ? 'is-current' : ''}>{name}</li>)}
                        </ol>
                        {r.moves > 0 && <div className="muted" style={{ fontSize: '0.8rem' }}>{r.moves === 1 ? '1 move' : `${r.moves} moves`}</div>}
                      </td>
                      <td>{r.department}</td>
                      <td className="nowrap">{formatDateTime(r.issued_at)}</td>
                      <td className="nowrap">{formatDateTime(r.last_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {data?.paging && <Pagination paging={data.paging} onPage={(page) => setFilters((f) => ({ ...f, page }))} />}
        {journeyFor !== null && <JourneyModal queueId={journeyFor} onClose={() => setJourneyFor(null)} />}
      </div>
    </Layout>
  );
}
