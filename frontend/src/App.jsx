import { useCallback, useEffect, useState } from 'react';
import { api, API_URL, session, setUnauthorizedHandler } from './api.js';
import AuthScreen from './components/AuthScreen.jsx';
import AdminLogin from './components/AdminLogin.jsx';
import AdminDashboard from './components/AdminDashboard.jsx';
import CustomerTable from './components/CustomerTable.jsx';
import ChatPanel from './components/ChatPanel.jsx';
import './App.css';

function Dashboard({ user, onLogout }) {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const notify = (text, error = false) => {
    setToast({ text, error });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    try {
      setCustomers(await api.list());
    } catch (err) {
      notify(`Could not load customers: ${err.message}`, true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // id === null creates; otherwise updates. Resolves true on success.
  const save = async (id, data) => {
    try {
      if (id === null) await api.create(data);
      else await api.update(id, data);
      await load();
      notify(id === null ? 'Customer added' : 'Customer updated');
      return true;
    } catch (err) {
      notify(err.message, true);
      return false;
    }
  };

  const remove = async (c) => {
    if (!window.confirm(`Delete ${c.customername}?`)) return;
    try {
      await api.remove(c.customer_id);
      await load();
      notify('Customer deleted');
    } catch (err) {
      notify(err.message, true);
    }
  };

  return (
    <div className="app">
      <nav className="topbar">
        <span className="logo">◆</span>
        <strong>Customer Hub</strong>
        <a href={`${API_URL}/swagger`} target="_blank" rel="noreferrer">API docs ↗</a>
        <span className="user-name">{user.name}</span>
        <button className="btn" onClick={onLogout}>Log out</button>
      </nav>
      <main className="layout">
        <CustomerTable customers={customers} loading={loading} onSave={save} onDelete={remove} />
        <ChatPanel onDataChanged={load} />
      </main>
      {toast && <div className={`toast${toast.error ? ' error' : ''}`}>{toast.text}</div>}
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(() => (session.token() ? session.user() : null));

  const [adminMode, setAdminMode] = useState(false);

  const logout = useCallback(() => {
    session.clear();
    setAdminMode(false);
    setUser(null); // unmounts Dashboard, which drops the previous user's data and chat
  }, []);

  useEffect(() => { setUnauthorizedHandler(logout); }, [logout]);

  const authenticated = (result) => {
    session.save(result);
    setUser(result.user);
  };

  if (user) {
    return user.role === 'admin'
      ? <AdminDashboard user={user} onLogout={logout} />
      : <Dashboard user={user} onLogout={logout} />;
  }
  return adminMode
    ? <AdminLogin onAuthenticated={authenticated} onBack={() => setAdminMode(false)} />
    : <AuthScreen onAuthenticated={authenticated} onAdminLogin={() => setAdminMode(true)} />;
}
