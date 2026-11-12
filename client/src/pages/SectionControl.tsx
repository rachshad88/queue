import { useEffect, useState } from 'react';
import { api } from '../api';
import { Layout } from '../components/Layout';
import { useLoader, useToast } from '../components/ui';
import { formatDateTime } from '../format';
import { useDepartmentEvents } from '../socket';
import { useSession } from '../auth';

interface Window {
  id: number;
  section_name: string;
  occupied_by: number | null;
  staff: string | null;
  username: string | null;
  updated_at: string | null;
}

/** Superadmin view of every window: who holds it, with release and history. */
export function SectionControl() {
  const toast = useToast();
  const { config } = useSession();
  const { data, reload } = useLoader(() => api('/sections-control'), []);
  const [history, setHistory] = useState<Record<string, Record<string, any>[]>>({});
  useDepartmentEvents([config.admission_dept_id, config.waiting_dept_id], 'controller', { 'queue-updated': reload });
  useEffect(() => {
    const timer = window.setInterval(reload, 15000);
    return () => window.clearInterval(timer);
  }, [reload]);

  const release = async (kind: string, w: Window): Promise<void> => {
    if (!window.confirm(`Release ${w.section_name} from ${w.staff ?? 'its holder'}?`)) {
      return;
    }
    const result = await api('/sections-release', { body: { type: kind, section_id: w.id } });
    toast(result.message ?? 'Done.', result.success ? 'success' : 'error');
    setHistory((h) => {
      const next = { ...h };
      delete next[`${kind}:${w.id}`];
      return next;
    });
    reload();
  };

  const toggleHistory = async (kind: string, w: Window): Promise<void> => {
    const key = `${kind}:${w.id}`;
    if (history[key]) {
      setHistory((h) => {
        const next = { ...h };
        delete next[key];
        return next;
      });
      return;
    }
    const result = await api(`/sections/${kind}/${w.id}/history`);
    setHistory((h) => ({ ...h, [key]: result.history ?? [] }));
  };

  const table = (kind: 'admission' | 'waiting', title: string) => (
    <div>
      <h2 style={{ marginBottom: '0.5rem' }}>{title}</h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Window</th><th>Held by</th><th>Last activity</th><th className="right">Actions</th></tr></thead>
          <tbody>
            {((data?.[kind] ?? []) as Window[]).map((w) => {
              const key = `${kind}:${w.id}`;
              return [
                <tr key={key}>
                  <td><strong>{w.section_name}</strong></td>
                  <td>{w.occupied_by ? <>{w.staff} <span className="muted">({w.username})</span></> : <span className="muted">Free</span>}</td>
                  <td className="nowrap">{formatDateTime(w.updated_at)}</td>
                  <td className="right nowrap">
                    <button className="btn btn-sm" onClick={() => void toggleHistory(kind, w)}>{history[key] ? 'Hide history' : 'History'}</button>{' '}
                    {w.occupied_by && <button className="btn btn-sm btn-danger" onClick={() => void release(kind, w)}>Release</button>}
                  </td>
                </tr>,
                history[key] && (
                  <tr key={`${key}:history`}>
                    <td colSpan={4} style={{ background: '#f8fafc' }}>
                      {history[key].length === 0 ? (
                        <span className="muted">No events recorded for this window yet.</span>
                      ) : (
                        <table>
                          <tbody>
                            {history[key].map((h, i) => (
                              <tr key={i}>
                                <td className="nowrap">{formatDateTime(h.created_at)}</td>
                                <td>{h.action}{h.reason ? ` (${h.reason})` : ''}</td>
                                <td>Holder: {h.holder_name ?? 'none'}</td>
                                <td>By: {h.operator_name}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                ),
              ];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <Layout title="Windows">
      <div className="stack">
        {table('admission', 'Admission Windows')}
        {table('waiting', 'Waiting Area Windows')}
      </div>
    </Layout>
  );
}
