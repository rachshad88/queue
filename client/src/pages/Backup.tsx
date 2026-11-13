import { useRef, useState } from 'react';
import { api } from '../api';
import { BASE } from '../base';
import { Layout } from '../components/Layout';
import { PasswordPrompt, useApi, useToast } from '../components/ui';
import { formatBytes, formatDateTime } from '../format';
import { useSocketEvent } from '../socket';

const STATE_TEXT: Record<string, string> = { ok: 'Backups are current', warn: 'Latest backup is getting old', critical: 'No recent backup' };

export function Backup() {
  const toast = useToast();
  const { data, reload, loading } = useApi('/backup');
  const [job, setJob] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  // The server announces a finished job over the socket (no polling). A quick
  // job can finish before its id is known here, so finished ids are remembered.
  const finished = useRef(new Set<string>());
  useSocketEvent('backup-job', (payload: { job?: string; state?: string; message?: string }) => {
    if (!payload?.job) {
      return;
    }
    finished.current.add(payload.job);
    toast(payload.message ?? 'Job finished.', payload.state === 'done' ? 'success' : 'error');
    setJob((current) => (current === payload.job ? null : current));
    reload();
  });

  const start = async (action: string, file?: string): Promise<void> => {
    const result = await api('/backup', { body: { action, file } });
    if (!result.success) {
      toast(result.message ?? 'Could not start the job.', 'error');
      return;
    }
    toast('Job started.', 'info');
    setJob(finished.current.has(result.job) ? null : result.job);
    reload();
  };

  const health = data?.health;
  const backups: { file: string; size: number; modified: string }[] = data?.backups ?? [];

  return (
    <Layout
      title="Database backup"
      actions={
        <>
          <button className="btn btn-primary" disabled={!!job || !health?.tools_installed} onClick={() => void start('backup')}>{job ? 'Working' : 'Back up now'}</button>
          <button className="btn" disabled={!!job} onClick={() => window.confirm(`Keep the newest ${health?.keep} backups and delete the rest?`) && void start('prune')}>Apply retention</button>
        </>
      }
    >
      <div className="stack">
        {health && !health.tools_installed && <p className="notice notice-error">mongodump and mongorestore are not installed on this server, so backups cannot run. Install the MongoDB Database Tools.</p>}
        {health && (
          <div className="tiles">
            <div className="tile">
              <div className="tile-label">Status</div>
              <p style={{ margin: '0.4rem 0' }}><span className={`badge state-${health.state}`}>{STATE_TEXT[health.state]}</span></p>
              <p className="muted">{health.newest_at ? `Newest: ${formatDateTime(health.newest_at)} (${health.newest_age_hours} hours ago)` : 'No backup has been taken yet.'}</p>
            </div>
            <div className="tile">
              <div className="tile-label">Database</div>
              <div className="stat-line"><span>Name</span><strong>{health.database}</strong></div>
              <div className="stat-line"><span>Data size</span><strong>{formatBytes(health.data_bytes)}</strong></div>
              <div className="stat-line"><span>Collections</span><strong>{health.collections}</strong></div>
            </div>
            <div className="tile">
              <div className="tile-label">Retention</div>
              <div className="stat-line"><span>Backups kept</span><strong>{health.backup_count} of {health.keep}</strong></div>
              <div className="stat-line"><span>Space used</span><strong>{formatBytes(health.backup_bytes)}</strong></div>
              <div className="stat-line"><span>Schedule</span><strong>{health.schedule}</strong></div>
            </div>
          </div>
        )}
        <div>
          <h2 style={{ marginBottom: '0.5rem' }}>Backups</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>File</th><th>Taken</th><th>Size</th><th className="right">Actions</th></tr></thead>
              <tbody>
                {!loading && backups.length === 0 && <tr><td colSpan={4} className="empty">No backups yet. Use "Back up now" to take the first one.</td></tr>}
                {backups.map((b) => (
                  <tr key={b.file}>
                    <td><strong>{b.file}</strong></td>
                    <td className="nowrap">{formatDateTime(b.modified)}</td>
                    <td>{formatBytes(b.size)}</td>
                    <td className="right nowrap">
                      <a className="btn btn-sm" href={`${BASE}/api/backup/download?file=${encodeURIComponent(b.file)}`} style={{ textDecoration: 'none' }}>Download</a>{' '}
                      <button className="btn btn-sm" disabled={!!job} onClick={() => void start('verify', b.file)}>Restore test</button>{' '}
                      <button className="btn btn-sm btn-danger" disabled={!!job || backups.length === 1} onClick={() => setDeleting(b.file)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ marginTop: '0.5rem' }}>
            A restore test loads the backup into a scratch database, checks every collection, then removes it. The live database is never overwritten from this page.
          </p>
        </div>
        <div>
          <h2 style={{ marginBottom: '0.5rem' }}>Recent jobs</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Started</th><th>Action</th><th>Result</th><th>Details</th></tr></thead>
              <tbody>
                {!loading && (data?.jobs ?? []).length === 0 && <tr><td colSpan={4} className="empty">No jobs have run from this page.</td></tr>}
                {(data?.jobs ?? []).map((j: Record<string, any>) => (
                  <tr key={j.id}><td className="nowrap">{formatDateTime(j.started_at)}</td><td>{j.action}</td><td><span className={`badge state-${j.state}`}>{j.state}</span></td><td>{j.message}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {deleting && (
        <PasswordPrompt
          title="Delete backup"
          hint={`Enter your password to permanently delete ${deleting}.`}
          confirmLabel="Delete backup"
          onClose={() => setDeleting(null)}
          onSubmit={async (password) => {
            const result = await api('/backup', { body: { action: 'delete', file: deleting, password } });
            toast(result.message ?? 'Done.', result.success ? 'success' : 'error');
            if (result.success) {
              setDeleting(null);
              reload();
            }
          }}
        />
      )}
    </Layout>
  );
}
