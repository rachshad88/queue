import { BASE } from '../base';
import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../auth';

const REASONS: Record<string, string> = {
  another_device: 'You were signed out because this account signed in on another device.',
  inactive: 'You were signed out after 30 minutes without activity.',
  revoked: 'You were signed out because an administrator changed or deactivated your account.',
};

export function Login() {
  const { user, refresh } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [destination, setDestination] = useState<string | null>(null);

  if (user && !busy) {
    return <Navigate to={destination ?? '/'} replace />;
  }

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const result = await api('/login', { body: { username, password }, quiet401: true });
    if (!result.success) {
      setError(result.message ?? 'Could not sign in.');
      setBusy(false);
      return;
    }
    setDestination(result.destination ?? '/');
    await refresh();
    setBusy(false);
    navigate(result.destination ?? '/', { replace: true });
  };

  const reason = REASONS[params.get('reason') ?? ''];
  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <img src={`${BASE}/img/logo.jpg`} alt="" />
        <h1>RHU Queue Management</h1>
        <p className="muted">Staff sign in</p>
        {reason && <p className="notice" style={{ marginBottom: '0.8rem' }}>{reason}</p>}
        {error && <p className="notice notice-error" style={{ marginBottom: '0.8rem' }}>{error}</p>}
        <label className="field">
          <span>Username</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required />
        </label>
        <label className="field">
          <span>Password</span>
          <input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        <label className="row" style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show password
        </label>
        <button className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={busy}>
          {busy ? 'Signing in' : 'Sign in'}
        </button>
        <p className="muted" style={{ marginTop: '1rem', marginBottom: 0, fontSize: '0.85rem' }}>
          <a href={`${BASE}/live`}>Open the live queue monitor</a>
        </p>
      </form>
    </div>
  );
}
