import { useEffect, useState } from 'react';
import { api, API_URL } from '../api.js';

export default function AdminDashboard({ user, onLogout }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.adminUsers().then(setData).catch((err) => {
      if (err.status === 403) onLogout(); // not an admin: back to login
      else setError(err.message);
    });
  }, [onLogout]);

  return (
    <div className="app">
      <nav className="topbar">
        <span className="logo">◆</span>
        <strong>Customer Hub · Admin</strong>
        <a href={`${API_URL}/swagger`} target="_blank" rel="noreferrer">API docs ↗</a>
        <span className="user-name">{user.name}</span>
        <button className="btn" onClick={onLogout}>Log out</button>
      </nav>
      <main className="layout admin-layout">
        <section className="card">
          <header className="card-head">
            <h2>Users <span className="badge">{data ? data.totals.users : '…'}</span></h2>
            {data && (
              <span className="muted">
                {data.totals.customers} customers assigned · {data.totals.unassigned_customers} unassigned
              </span>
            )}
          </header>
          {error && <div className="form-error" role="alert">Could not load users: {error}</div>}
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Name</th><th>Email</th><th>Role</th><th>Registered</th><th>Customers</th></tr>
              </thead>
              <tbody>
                {!data && !error && <tr><td colSpan="5" className="muted">Loading…</td></tr>}
                {data?.users.length === 0 && <tr><td colSpan="5" className="muted">No users</td></tr>}
                {data?.users.map((u) => (
                  <tr key={u.user_id}>
                    <td>{u.name}</td>
                    <td className="muted">{u.email}</td>
                    <td>{u.role}</td>
                    <td className="muted">{new Date(u.created_at).toLocaleDateString()}</td>
                    <td>{u.customer_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
