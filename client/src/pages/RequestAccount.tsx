import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { BASE } from '../base';
import { formatDateTime } from '../format';

type Department = { id: number; name: string };
type Status = { status: 'pending' | 'approved' | 'rejected'; reason: string | null; username: string; requested_at: string; decided_at: string | null };

const BLANK = { username: '', firstname: '', middlename: '', lastname: '', position: '', department: '' };

/** Before sign-in: staff ask for an account, then check whether an admin approved it. */
export function RequestAccount() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [defaultPassword, setDefaultPassword] = useState('12345');
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState<{ username: string; code: string } | null>(null);
  const [check, setCheck] = useState({ username: '', code: '' });
  const [checkError, setCheckError] = useState('');
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    void api('/account-requests/departments').then((r) => {
      if (r.success) {
        setDepartments(r.departments ?? []);
        setDefaultPassword(r.default_password ?? '12345');
      }
    });
  }, []);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const result = await api('/account-requests', { body: form });
    setBusy(false);
    if (!result.success) {
      setError(result.message ?? 'The request could not be sent.');
      return;
    }
    setSent({ username: result.username, code: result.code });
    setCheck({ username: result.username, code: result.code });
    setForm(BLANK);
  };

  const lookUp = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setCheckError('');
    setStatus(null);
    const result = await api(`/account-requests/status?username=${encodeURIComponent(check.username)}&code=${encodeURIComponent(check.code)}`);
    if (!result.success) {
      setCheckError(result.message ?? 'No request matches that username and code.');
      return;
    }
    setStatus(result as unknown as Status);
  };

  const field = (key: keyof typeof BLANK, label: string, options: { required?: boolean; max?: number; hint?: string } = {}) => (
    <label className="arcade-field">
      <span>{label}{options.required ? '' : ' · optional'}</span>
      <input value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} required={options.required} maxLength={options.max ?? 60} placeholder={options.hint} />
    </label>
  );

  return (
    <div className="arcade request-page">
      <div className="arcade-crt" aria-hidden="true" />
      <header className="arcade-nav">
        <Link to="/login" className="arcade-brand">
          <img src={`${BASE}/img/logo.jpg`} alt="" />
          <span>RHU<em>QUEUE</em></span>
        </Link>
        <div className="arcade-nav-actions">
          <Link className="arcade-btn" to="/login">◀ Back to sign in</Link>
        </div>
      </header>

      <section className="request-scene">
        <div className="arcade-sky" aria-hidden="true">
          <svg className="arcade-cloud" viewBox="0 0 24 10" shapeRendering="crispEdges" style={{ top: '6%', animationDelay: '-12s', animationDuration: '70s' }}><rect x="7" y="0" width="7" height="2" /><rect x="4" y="2" width="14" height="2" /><rect x="15" y="1" width="4" height="2" /><rect x="1" y="4" width="22" height="3" /><rect x="0" y="7" width="24" height="2" className="shade" /></svg>
          <svg className="arcade-cloud" viewBox="0 0 24 10" shapeRendering="crispEdges" style={{ top: '18%', animationDelay: '-44s', animationDuration: '95s' }}><rect x="7" y="0" width="7" height="2" /><rect x="4" y="2" width="14" height="2" /><rect x="15" y="1" width="4" height="2" /><rect x="1" y="4" width="22" height="3" /><rect x="0" y="7" width="24" height="2" className="shade" /></svg>
          <svg className="arcade-cloud" viewBox="0 0 24 10" shapeRendering="crispEdges" style={{ top: '30%', animationDelay: '-70s', animationDuration: '85s' }}><rect x="7" y="0" width="7" height="2" /><rect x="4" y="2" width="14" height="2" /><rect x="15" y="1" width="4" height="2" /><rect x="1" y="4" width="22" height="3" /><rect x="0" y="7" width="24" height="2" className="shade" /></svg>
          <div className="arcade-sun" />
        </div>

        <div className="request-intro">
          <p className="request-kicker">New player</p>
          <h1 className="request-title">Join the team</h1>
          <p className="request-lede">Ask for a staff account. An admin checks it, then you sign in with <b>{defaultPassword}</b> and pick your own password.</p>
        </div>

        <div className="request-signs">
          <section className="request-sign">
            <span className="request-sign-tab" aria-hidden="true">Exit 2 · New staff</span>
            <div className="arcade-cabinet-head">
              <img src={`${BASE}/img/logo.jpg`} alt="" />
              <div>
                <h2>Request account</h2>
                <p>Create player</p>
              </div>
            </div>
            {sent ? (
              <div className="request-sent" role="status">
                <p className="arcade-alert">Request sent! An admin will review it soon.</p>
                <p className="request-label">Your request code</p>
                <p className="request-code">{sent.code}</p>
                <p className="request-note">Write it down. With <b>{sent.username}</b> and this code you can check your request.</p>
                <p className="request-note">Once approved, sign in as <b>{sent.username}</b> with <b>{defaultPassword}</b>, then change your password.</p>
                <button type="button" className="arcade-btn arcade-btn-ghost" onClick={() => setSent(null)}>Send another request</button>
              </div>
            ) : (
              <form onSubmit={(e) => void submit(e)}>
                {error && <p className="arcade-alert arcade-alert-error" role="alert">{error}</p>}
                <div className="request-grid">
                  <label className="arcade-field">
                    <span>Username</span>
                    <input value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} required maxLength={50} pattern="[\p{L}\p{N}._@\-]+" title="Letters, numbers and . _ @ - (no spaces)" placeholder="maria.santos" autoComplete="username" autoFocus />
                  </label>
                  <label className="arcade-field">
                    <span>Department</span>
                    <select value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} required>
                      <option value="">Choose…</option>
                      {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </label>
                  {field('firstname', 'First name', { required: true })}
                  {field('middlename', 'Middle name')}
                  {field('lastname', 'Last name', { required: true })}
                  {field('position', 'Position', { hint: 'Nurse I' })}
                </div>
                <button className="arcade-btn arcade-btn-big request-send" disabled={busy}>{busy ? 'Sending…' : '▶ Send request'}</button>
              </form>
            )}
          </section>

          <section className="request-sign request-sign-blue">
            <span className="request-sign-tab" aria-hidden="true">Status check</span>
            <div className="arcade-cabinet-head">
              <div>
                <h2>Check request</h2>
                <p>Continue?</p>
              </div>
            </div>
            <form onSubmit={(e) => void lookUp(e)}>
              <label className="arcade-field"><span>Username</span><input value={check.username} onChange={(e) => setCheck((c) => ({ ...c, username: e.target.value }))} required maxLength={50} /></label>
              <label className="arcade-field"><span>Request code</span><input className="request-code-input" value={check.code} onChange={(e) => setCheck((c) => ({ ...c, code: e.target.value.toUpperCase() }))} required maxLength={6} placeholder="ABC123" /></label>
              <button className="arcade-btn request-send">Check</button>
            </form>
            {checkError && <p className="arcade-alert arcade-alert-error request-result" role="alert">{checkError}</p>}
            {status && (
              <div className={`request-result request-status is-${status.status}`} role="status">
                {status.status === 'pending' && <p><b>Waiting for an admin.</b> Sent {formatDateTime(status.requested_at)}.</p>}
                {status.status === 'approved' && (
                  <>
                    <p><b>Approved!</b> Sign in as <b>{status.username}</b> with <b>{defaultPassword}</b>, then change your password.</p>
                    <Link className="arcade-btn" to="/login">▶ Go to sign in</Link>
                  </>
                )}
                {status.status === 'rejected' && (
                  <p><b>Not approved.</b> {status.reason ? <>Reason: {status.reason}</> : 'No reason was given.'} You can send a new request.</p>
                )}
              </div>
            )}
          </section>
        </div>
        <div className="request-ground" aria-hidden="true" />
      </section>
    </div>
  );
}
