import { useEffect, useState } from 'react';
import { api } from '../api';
import { useSession } from '../auth';
import { Layout } from '../components/Layout';
import { useToast } from '../components/ui';

export function Account() {
  const toast = useToast();
  const { refresh } = useSession();
  const [form, setForm] = useState({ username: '', firstname: '', middlename: '', lastname: '', position: '' });
  const [department, setDepartment] = useState('');
  const [pw, setPw] = useState({ old_password: '', new_password: '', confirm: '' });

  useEffect(() => {
    void api('/account').then((r) => {
      if (r.success) {
        setForm({ username: r.user.username, firstname: r.user.firstname, middlename: r.user.middlename, lastname: r.user.lastname, position: r.user.position });
        setDepartment(r.user.department);
      }
    });
  }, []);

  const field = (key: keyof typeof form, label: string, required = false) => (
    <label className="field"><span>{label}</span><input value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} required={required} maxLength={key === 'username' ? 50 : 60} /></label>
  );

  return (
    <Layout title="My account">
      <div className="stack" style={{ maxWidth: 760 }}>
        <form
          className="card"
          onSubmit={async (e) => {
            e.preventDefault();
            const result = await api('/account', { method: 'PUT', body: form });
            toast(result.message ?? 'Saved.', result.success ? 'success' : 'error');
            if (result.success) {
              await refresh();
            }
          }}
        >
          <div className="card-head"><h2>Profile</h2><span className="muted">{department}</span></div>
          <div className="form-grid">
            {field('username', 'Username', true)}
            {field('firstname', 'First name', true)}
            {field('middlename', 'Middle name')}
            {field('lastname', 'Last name', true)}
            {field('position', 'Position')}
          </div>
          <button className="btn btn-primary">Save profile</button>
        </form>
        <form
          className="card"
          onSubmit={async (e) => {
            e.preventDefault();
            if (pw.new_password !== pw.confirm) {
              toast('The new passwords do not match.', 'error');
              return;
            }
            const result = await api('/update-password', { body: { old_password: pw.old_password, new_password: pw.new_password } });
            toast(result.success ? 'Password changed.' : (result.message ?? 'Could not change the password.'), result.success ? 'success' : 'error');
            if (result.success) {
              setPw({ old_password: '', new_password: '', confirm: '' });
            }
          }}
        >
          <div className="card-head"><h2>Change password</h2></div>
          <div className="form-grid">
            <label className="field"><span>Current password</span><input type="password" value={pw.old_password} onChange={(e) => setPw((p) => ({ ...p, old_password: e.target.value }))} autoComplete="current-password" required /></label>
            <label className="field"><span>New password (5 characters or more)</span><input type="password" value={pw.new_password} onChange={(e) => setPw((p) => ({ ...p, new_password: e.target.value }))} autoComplete="new-password" minLength={5} maxLength={72} required /></label>
            <label className="field"><span>Repeat new password</span><input type="password" value={pw.confirm} onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))} autoComplete="new-password" required /></label>
          </div>
          <button className="btn btn-primary">Change password</button>
        </form>
      </div>
    </Layout>
  );
}
