export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '');

async function request(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  list: () => request('/api/customers'),
  create: (c) => request('/api/customers', { method: 'POST', body: JSON.stringify(c) }),
  update: (id, c) => request(`/api/customers/${id}`, { method: 'PUT', body: JSON.stringify(c) }),
  remove: (id) => request(`/api/customers/${id}`, { method: 'DELETE' }),
  chat: (message) => request('/api/agent', { method: 'POST', body: JSON.stringify({ message }) }),
};
