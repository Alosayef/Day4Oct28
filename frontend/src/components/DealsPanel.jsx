import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

const STAGES = [
  { value: 'lead', label: 'Lead' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'proposal', label: 'Proposal' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
];
const OPEN_STAGES = ['lead', 'qualified', 'proposal'];

const money = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: Number.isInteger(n) ? 0 : 2 }).format(n);

// YYYY-MM-DD -> "30 Nov 2026", built from the parts so no time zone can shift the day
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const formatDate = (s) => {
  if (!s) return '—';
  const [y, m, d] = s.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

const EMPTY = { title: '', amount: '', stage: 'lead', expected_close_date: '' };

export default function DealsPanel({ customer, onClose, notify }) {
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null); // null = hidden; { id: null | number, ...fields }
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setDeals(await api.listDeals(customer.customer_id));
    } catch (err) {
      notify(`Could not load deals: ${err.message}`, true);
    } finally {
      setLoading(false);
    }
  }, [customer.customer_id, notify]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const openTotal = deals.filter((d) => OPEN_STAGES.includes(d.stage)).reduce((sum, d) => sum + d.amount, 0);

  const startAdd = () => setForm({ id: null, ...EMPTY });
  const startEdit = (d) => setForm({
    id: d.deal_id, title: d.title, amount: String(d.amount), stage: d.stage, expected_close_date: d.expected_close_date ?? '',
  });

  const submit = async (e) => {
    e.preventDefault();
    const title = form.title.trim();
    const amount = Number(form.amount);
    if (!title || title.length > 200) return notify('Title is required (up to 200 characters)', true);
    if (form.amount.trim() === '' || !Number.isFinite(amount) || amount < 0) return notify('Amount must be a number of 0 or more', true);
    if (Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6) return notify('Amount can have at most 2 decimals', true);
    const body = { title, amount, stage: form.stage, expected_close_date: form.expected_close_date || null };
    setBusy(true);
    try {
      if (form.id === null) await api.createDeal(customer.customer_id, body);
      else await api.updateDeal(form.id, body);
      setForm(null);
      await load();
      notify(form.id === null ? 'Deal added' : 'Deal updated');
    } catch (err) {
      notify(err.message, true);
    } finally {
      setBusy(false);
    }
  };

  const changeStage = async (d, stage) => {
    try {
      await api.updateDeal(d.deal_id, { stage });
      await load();
    } catch (err) {
      notify(err.message, true);
    }
  };

  const remove = async (d) => {
    if (!window.confirm(`Delete the deal "${d.title}"?`)) return;
    try {
      await api.removeDeal(d.deal_id);
      await load();
      notify('Deal deleted');
    } catch (err) {
      notify(err.message, true);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="card modal" role="dialog" aria-modal="true" aria-label={`Deals for ${customer.customername}`}
        onClick={(e) => e.stopPropagation()}>
        <header className="card-head">
          <div>
            <h2>Deals · {customer.customername}</h2>
            <div className="muted deal-summary">
              {deals.length} {deals.length === 1 ? 'deal' : 'deals'} · open total {money(openTotal)}
            </div>
          </div>
          <div className="actions">
            <button className="btn primary" type="button" onClick={startAdd}>+ Add deal</button>
            <button className="btn" type="button" onClick={onClose}>Close</button>
          </div>
        </header>

        {form && (
          <form className="deal-form" onSubmit={submit}>
            <label>Title
              <input required maxLength={200} value={form.title} placeholder="Brochure printing – Q4"
                onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
            <label>Amount ($)
              <input required type="number" min="0" step="0.01" value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </label>
            <label>Stage
              <select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}>
                {STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
            <label>Expected close date
              <input type="date" value={form.expected_close_date}
                onChange={(e) => setForm({ ...form, expected_close_date: e.target.value })} />
            </label>
            <div className="deal-form-actions">
              <button className="btn primary" type="submit" disabled={busy}>{form.id === null ? 'Add deal' : 'Save'}</button>
              <button className="btn" type="button" onClick={() => setForm(null)}>Cancel</button>
            </div>
          </form>
        )}

        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Title</th><th>Amount</th><th>Stage</th><th>Expected close</th><th aria-label="Actions" /></tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan="5" className="muted">Loading…</td></tr>}
              {!loading && deals.length === 0 && (
                <tr><td colSpan="5" className="muted">No deals yet</td></tr>
              )}
              {deals.map((d) => (
                <tr key={d.deal_id}>
                  <td>{d.title}</td>
                  <td>{money(d.amount)}</td>
                  <td>
                    <select className={`stage stage-${d.stage}`} aria-label={`Change stage of ${d.title}`} value={d.stage}
                      onChange={(e) => changeStage(d, e.target.value)}>
                      {STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </td>
                  <td>{formatDate(d.expected_close_date)}</td>
                  <td className="actions">
                    <button className="btn" onClick={() => startEdit(d)}>Edit</button>
                    <button className="btn danger" onClick={() => remove(d)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
