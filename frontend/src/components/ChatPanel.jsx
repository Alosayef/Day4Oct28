import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

const SUGGESTIONS = ['Show all customers', 'Find customer Salman', 'Add Sara Ahmed in Riyadh'];

const WRITE_TOOLS = ['add_customer', 'update_customer', 'delete_customer'];

export default function ChatPanel({ onDataChanged }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'Hi! Ask me about your customers in plain English.' },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  const send = async (text) => {
    const message = text.trim();
    if (!message || busy) return;
    setMessages((m) => [...m, { role: 'user', text: message }]);
    setInput('');
    setBusy(true);
    try {
      const { answer, toolCalls } = await api.chat(message);
      setMessages((m) => [...m, { role: 'assistant', text: answer, tools: toolCalls }]);
      if (toolCalls.some((t) => WRITE_TOOLS.includes(t.name))) onDataChanged();
    } catch (err) {
      setMessages((m) => [...m, { role: 'assistant', text: err.message, error: true }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card chat">
      <header className="card-head"><h2>Assistant</h2></header>

      <div className="messages">
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}${m.error ? ' error' : ''}`}>
            <div className="bubble">{m.text}</div>
            {m.tools?.length > 0 && (
              <div className="tools">
                {m.tools.map((t, j) => <span key={j} className="chip">⚙ {t.name}</span>)}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="msg assistant"><div className="bubble typing"><i /><i /><i /></div></div>}
        <div ref={endRef} />
      </div>

      <div className="suggestions">
        {SUGGESTIONS.map((s) => (
          <button key={s} className="chip" onClick={() => send(s)} disabled={busy}>{s}</button>
        ))}
      </div>

      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <input
          placeholder="Ask something…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
        />
        <button className="btn primary" type="submit" disabled={busy || !input.trim()}>Send</button>
      </form>
    </section>
  );
}
