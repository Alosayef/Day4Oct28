export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '');

const TOKEN_KEY = 'customer_hub_token';
const USER_KEY = 'customer_hub_user';

// localStorage can throw (private mode, blocked site data), so the session degrades to in-memory
let memory = {};
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return memory[k] ?? null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { memory[k] = v; } },
  del: (k) => { try { localStorage.removeItem(k); } catch { delete memory[k]; } },
};

export const session = {
  token: () => store.get(TOKEN_KEY),
  user: () => {
    try { return JSON.parse(store.get(USER_KEY)); } catch { return null; }
  },
  save: ({ token, user }) => { store.set(TOKEN_KEY, token); store.set(USER_KEY, JSON.stringify(user)); },
  clear: () => { store.del(TOKEN_KEY); store.del(USER_KEY); },
};

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

async function request(path, options = {}) {
  const token = session.token();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  // A 401 on a protected call means the session is gone; login/register 401s are shown inline instead
  if (res.status === 401 && token && !path.endsWith('/login')) onUnauthorized();
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status });
  return data;
}

// The export is a binary file, so it cannot go through request() (which parses JSON)
async function exportCustomers() {
  const token = session.token();
  const res = await fetch(`${API_URL}/api/customers/export`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && token) onUnauthorized();
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  const match = /filename="?([^";]+)"?/.exec(res.headers.get('Content-Disposition') || '');
  return { blob: await res.blob(), filename: match ? match[1] : 'customers.xlsx' };
}

export const api = {
  exportCustomers,
  register: (body) => request('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body) => request('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  adminLogin: (body) => request('/api/admin/login', { method: 'POST', body: JSON.stringify(body) }),
  adminUsers: () => request('/api/admin/users'),
  list: () => request('/api/customers'),
  create: (c) => request('/api/customers', { method: 'POST', body: JSON.stringify(c) }),
  update: (id, c) => request(`/api/customers/${id}`, { method: 'PUT', body: JSON.stringify(c) }),
  remove: (id) => request(`/api/customers/${id}`, { method: 'DELETE' }),
  chat: (message) => request('/api/agent', { method: 'POST', body: JSON.stringify({ message }) }),
};
