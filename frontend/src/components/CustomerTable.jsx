import { useState } from 'react';

export default function CustomerTable({ customers, loading, onSave, onDelete, onExport, onDeals }) {
  const [exporting, setExporting] = useState(false);
  const [editing, setEditing] = useState(null); // customer_id being edited
  const [draft, setDraft] = useState({ customername: '', location: '' });
  const [adding, setAdding] = useState({ customername: '', location: '' });
  const [query, setQuery] = useState('');

  const filtered = customers.filter((c) =>
    `${c.customername} ${c.location}`.toLowerCase().includes(query.toLowerCase())
  );

  const startEdit = (c) => {
    setEditing(c.customer_id);
    setDraft({ customername: c.customername, location: c.location });
  };

  const submitAdd = async (e) => {
    e.preventDefault();
    if (await onSave(null, adding)) setAdding({ customername: '', location: '' });
  };

  const submitEdit = async (id) => {
    if (await onSave(id, draft)) setEditing(null);
  };

  const exportClick = async () => {
    setExporting(true);
    try { await onExport(); } finally { setExporting(false); }
  };

  return (
    <section className="card">
      <header className="card-head">
        <h2>Customers <span className="badge">{customers.length}</span></h2>
        <input
          className="search"
          placeholder="Search…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="btn" type="button" onClick={exportClick} disabled={exporting}>
          {exporting ? 'Exporting…' : 'Export to Excel'}
        </button>
      </header>

      <form className="add-row" onSubmit={submitAdd}>
        <input
          required
          placeholder="Customer name"
          value={adding.customername}
          onChange={(e) => setAdding({ ...adding, customername: e.target.value })}
        />
        <input
          required
          placeholder="Location"
          value={adding.location}
          onChange={(e) => setAdding({ ...adding, location: e.target.value })}
        />
        <button className="btn primary" type="submit">+ Add</button>
      </form>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>ID</th><th>Name</th><th>Location</th><th aria-label="Actions" /></tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan="4" className="muted">Loading…</td></tr>}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan="4" className="muted">No customers found</td></tr>
            )}
            {filtered.map((c) => (
              <tr key={c.customer_id}>
                <td className="muted">#{c.customer_id}</td>
                {editing === c.customer_id ? (
                  <>
                    <td>
                      <input value={draft.customername}
                        onChange={(e) => setDraft({ ...draft, customername: e.target.value })} />
                    </td>
                    <td>
                      <input value={draft.location}
                        onChange={(e) => setDraft({ ...draft, location: e.target.value })} />
                    </td>
                    <td className="actions">
                      <button className="btn primary" onClick={() => submitEdit(c.customer_id)}>Save</button>
                      <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td><span className="avatar">{c.customername[0]?.toUpperCase()}</span>{c.customername}</td>
                    <td>{c.location}</td>
                    <td className="actions">
                      <button className="btn" onClick={() => onDeals(c)}>Deals</button>
                      <button className="btn" onClick={() => startEdit(c)}>Edit</button>
                      <button className="btn danger" onClick={() => onDelete(c)}>Delete</button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
