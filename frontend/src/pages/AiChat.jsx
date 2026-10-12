import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { Loading, ErrorBox } from '../components/ui.jsx';

const SUGGESTIONS = [
  'Khách nào cần chăm sóc gấp?',
  'Hôm nay tôi có bao nhiêu lịch hẹn?',
  'Tóm tắt hiệu suất tuần này',
  'Deal nào sắp đến hạn thanh toán?',
];

export default function AiChat() {
  const [messages, setMessages] = useState([]); // {role: 'user'|'ai'|'system', text, credits}
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [quota, setQuota] = useState(null);
  const [quotaError, setQuotaError] = useState('');
  const [outOfCredits, setOutOfCredits] = useState(false);
  const [toppingUp, setToppingUp] = useState(false);
  const bottomRef = useRef(null);

  async function loadQuota() {
    try {
      const q = await api('/ai/quota');
      setQuota(q);
      setOutOfCredits(false);
    } catch (e) {
      setQuotaError(e.message);
    }
  }
  useEffect(() => { loadQuota(); }, []);

  useEffect(() => {
    if (bottomRef.current && typeof bottomRef.current.scrollIntoView === 'function') {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, sending]);

  async function send(text) {
    const question = (text ?? input).trim();
    if (!question || sending) return;
    setInput('');
    setOutOfCredits(false);
    setMessages((m) => [...m, { role: 'user', text: question }]);
    setSending(true);
    try {
      const res = await api('/ai/ask', {
        method: 'POST',
        body: JSON.stringify({ feature: 'qa_ask', input: question }),
      });
      const answer = res?.result?.text || res?.text || 'AI chưa trả lời được câu này.';
      setMessages((m) => [...m, { role: 'ai', text: answer, credits: res?.credits_charged }]);
      if (res?.balance != null) {
        setQuota((q) => (q ? { ...q, balance: res.balance } : q));
      } else {
        loadQuota();
      }
    } catch (e) {
      if (e.status === 402) {
        setOutOfCredits(true);
        setMessages((m) => [...m, {
          role: 'system',
          text: '⚡ Bạn đã hết credit AI tháng này. Nạp thêm để tiếp tục hỏi đáp.',
        }]);
      } else {
        setMessages((m) => [...m, { role: 'system', text: '❌ Lỗi: ' + e.message }]);
      }
    } finally {
      setSending(false);
    }
  }

  async function topup() {
    setToppingUp(true);
    try {
      await api('/ai/quota/topup', {
        method: 'POST',
        body: JSON.stringify({ credits: 100 }),
      });
      await loadQuota();
      setMessages((m) => [...m, { role: 'system', text: '✅ Đã nạp 100 credits demo. Bạn có thể tiếp tục hỏi AI.' }]);
    } catch (e) {
      setMessages((m) => [...m, { role: 'system', text: '❌ Không nạp được: ' + e.message + '. Vui lòng liên hệ admin.' }]);
    } finally {
      setToppingUp(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="ai-chat">
      <div className="header">
        <h1>🤖 Trợ lý AI</h1>
        <div className="sub">
          {quota ? (
            <>⚡ Còn <b>{quota.balance}</b> credits tháng này</>
          ) : quotaError ? (
            <span className="muted">Không tải được quota</span>
          ) : (
            <span className="muted">Đang tải quota…</span>
          )}
        </div>
      </div>

      <div className="ai-messages">
        {messages.length === 0 && !sending && (
          <div className="ai-welcome">
            <div style={{ fontSize: 48, marginBottom: 8 }}>🤖</div>
            <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4 }}>Xin chào! Tôi có thể giúp gì?</div>
            <div className="muted" style={{ marginBottom: 12 }}>
              Hỏi về khách hàng, lịch hẹn, hiệu suất, giao dịch…
            </div>
            <div className="ai-suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="chip" onClick={() => send(s)} disabled={sending}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`ai-msg ai-msg-${m.role}`}>
            <div className="ai-bubble">
              <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>
              {m.role === 'ai' && m.credits != null && (
                <div className="ai-credits">−{m.credits} credit</div>
              )}
            </div>
          </div>
        ))}

        {sending && (
          <div className="ai-msg ai-msg-ai">
            <div className="ai-bubble">
              <span className="ai-typing"><span /><span /><span /></span>
            </div>
          </div>
        )}

        {outOfCredits && (
          <div className="card" style={{ margin: '8px 0', textAlign: 'center' }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Hết credit AI</div>
            <button className="btn btn-primary" onClick={topup} disabled={toppingUp}>
              {toppingUp ? 'Đang nạp…' : '⚡ Nạp 100 credits demo'}
            </button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="ai-inputbar">
        <input
          className="input"
          placeholder="Hỏi AI về công việc của bạn…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={sending}
        />
        <button
          className="btn btn-primary ai-send"
          onClick={() => send()}
          disabled={sending || !input.trim()}
        >
          {sending ? '…' : '➤'}
        </button>
      </div>
    </div>
  );
}
