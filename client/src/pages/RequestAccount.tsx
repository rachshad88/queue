import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { BASE } from '../base';
import { formatDateTime } from '../format';
import { Walker } from './LoginJourney';

type Department = { id: number; name: string };
type Status = { status: 'pending' | 'approved' | 'rejected'; reason: string | null; username: string; requested_at: string; decided_at: string | null };

const BLANK = { username: '', firstname: '', middlename: '', lastname: '', position: '', department: '' };
const STAGES = ['Fill the form', 'Keep your code', 'Admin approves', 'Sign in'];
const CONFETTI_COLORS = ['#ffd84a', '#ff4757', '#9dff8a', '#6cc0ff', '#ffffff'];
type Vars = CSSProperties & Record<`--${string}`, string | number>;

/** A burst of pixel confetti; remounted by key so it plays again. */
function Confetti() {
  return (
    <div className="request-confetti" aria-hidden="true">
      {Array.from({ length: 28 }, (_, n) => (
        <i key={n} style={{ '--x': `${(n * 37) % 100}%`, '--d': `${(n % 7) * 90}ms`, '--r': `${(n % 5) * 60 - 120}deg`, background: CONFETTI_COLORS[n % CONFETTI_COLORS.length] } as Vars} />
      ))}
    </div>
  );
}

/** Before sign-in: staff ask for an account, then check whether an admin approved it. */
export function RequestAccount() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [defaultPassword, setDefaultPassword] = useState('12345');
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState<{ username: string; code: string } | null>(null);
  const [card, setCard] = useState(BLANK);
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
    setCard(form);
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

  const shown = sent ? card : form;
  const fullName = [shown.firstname, shown.middlename, shown.lastname].map((x) => x.trim()).filter(Boolean).join(' ');
  const initials = [shown.firstname, shown.lastname].map((x) => x.trim().charAt(0).toUpperCase()).join('') || '?';
  const departmentName = departments.find((d) => String(d.id) === shown.department)?.name ?? '';
  const stage = status?.status === 'approved' ? 3 : status ? 2 : sent ? 1 : 0;
  const cardState = status?.status ?? (sent ? 'pending' : 'draft');
  const cardLabel = { draft: 'Not sent yet', pending: 'Waiting for admin', approved: 'Approved!', rejected: 'Not approved' }[cardState];
  const celebrate = status?.status === 'approved' ? 'approved' : sent ? `sent-${sent.code}` : '';

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
          <div className="request-hills request-hills-far" />
          <div className="request-hills" />
        </div>
        {celebrate && <Confetti key={celebrate} />}

        <div className="request-intro">
          <p className="request-kicker">New player</p>
          <h1 className="request-title">Join the team</h1>
          <p className="request-lede">Ask for a staff account. An admin checks it, then you sign in with <b>{defaultPassword}</b> and pick your own password.</p>
        </div>

        <ol className="request-track" aria-label="Your progress">
          {STAGES.map((label, index) => (
            <li key={label} className={index < stage ? 'done' : index === stage ? 'here' : ''}>
              {index === stage && <span className="request-track-runner"><Walker /></span>}
              <b>{index < stage ? '✔' : index + 1}</b>
              <span>{label}</span>
            </li>
          ))}
        </ol>

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
                <button type="button" className="arcade-btn arcade-btn-ghost" onClick={() => { setSent(null); setCard(BLANK); }}>Send another request</button>
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

          <div className="request-side">
          <div className={`request-player is-${cardState}`} aria-label="Preview of your account">
            <span className="request-player-tag">Player 2</span>
            <div className="request-avatar">{initials}</div>
            <div className="request-player-info">
              <b>{fullName || 'Your name'}</b>
              <span>@{shown.username.trim() || 'username'}</span>
              <span className="request-player-chips">
                <i>{departmentName || 'Department'}</i>
                {shown.position.trim() && <i>{shown.position.trim()}</i>}
              </span>
            </div>
            <span className="request-player-state">{cardLabel}</span>
          </div>

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
        </div>
        <div className="request-ground" aria-hidden="true" />
      </section>
    </div>
  );
}
