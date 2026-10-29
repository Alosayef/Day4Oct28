import { useState } from 'react';
import { api } from '../api.js';

export default function AdminLogin({ onAuthenticated, onBack }) {
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      onAuthenticated(await api.adminLogin(form));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <section className="card auth-card">
        <div className="auth-brand"><span className="logo">◆</span> Customer Hub · Admin</div>

        <form onSubmit={submit} className="auth-form">
          <label>Email
            <input required type="email" value={form.email} onChange={set('email')} autoComplete="username" />
          </label>
          <label>Password
            <input required type="password" value={form.password} onChange={set('password')}
              autoComplete="current-password" />
          </label>

          {error && <div className="form-error" role="alert">{error}</div>}

          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : 'Log in as admin'}
          </button>
          <button className="btn" type="button" onClick={onBack}>Back to login</button>
        </form>
      </section>
    </div>
  );
}
