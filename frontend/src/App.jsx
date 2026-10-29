import { useCallback, useEffect, useState } from 'react';
import { api, API_URL, session, setUnauthorizedHandler } from './api.js';
import AuthScreen from './components/AuthScreen.jsx';
import AdminLogin from './components/AdminLogin.jsx';
import AdminDashboard from './components/AdminDashboard.jsx';
import CustomerTable from './components/CustomerTable.jsx';
import DealsPanel from './components/DealsPanel.jsx';
import ChatPanel from './components/ChatPanel.jsx';
import './App.css';

function Dashboard({ user, onLogout }) {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [dealsFor, setDealsFor] = useState(null); // customer whose deals panel is open

  const notify = useCallback((text, error = false) => {
    setToast({ text, error });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async () => {
    try {
      setCustomers(await api.list());
    } catch (err) {
      notify(`Could not load customers: ${err.message}`, true);
    } finally {
      setLoading(false);
    }
  }, [notify]);

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

  const exportToExcel = async () => {
    try {
      const { blob, filename } = await api.exportCustomers();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      notify('Export downloaded');
    } catch (err) {
      notify(`Export failed: ${err.message}`, true);
    }
  };

  const remove = async (c) => {
    // Warn when the customer's deals will go with it; if the lookup fails, fall back to the plain message
    let dealCount = 0;
    try { dealCount = (await api.listDeals(c.customer_id)).length; } catch { /* plain confirmation */ }
    const dealsNote = dealCount > 0 ? ` and its ${dealCount} ${dealCount === 1 ? 'deal' : 'deals'}` : '';
    if (!window.confirm(`Delete ${c.customername}${dealsNote}?`)) return;
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
        <CustomerTable customers={customers} loading={loading} onSave={save} onDelete={remove} onExport={exportToExcel} onDeals={setDealsFor} />
        <ChatPanel onDataChanged={load} />
      </main>
      {dealsFor && <DealsPanel customer={dealsFor} onClose={() => setDealsFor(null)} notify={notify} />}
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
