import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Loading, ErrorBox, Empty } from '../components/ui.jsx';

function Modal({ title, onClose, children }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(23,39,68,0.55)', display: 'flex',
      alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onClose}>
      <div className="card" style={{ width: '100%', maxWidth: 480, margin: 0, borderRadius: '16px 16px 0 0', maxHeight: '85vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="section-title" style={{ marginBottom: 12 }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    alert('Đã copy!');
  } catch {
    // fallback cho trình duyệt cũ
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); alert('Đã copy!'); } catch { alert('Không copy được, hãy copy thủ công'); }
    document.body.removeChild(ta);
  }
}

const SAMPLE_CODE = `curl -X POST https://your-domain/api/public/leads \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: <key của bạn>" \\
  -d '{"name": "Nguyễn Văn A", "phone": "0901234567", "source": "Facebook Ads", "note": "..."}'`;

function fmtDateTime(s) {
  if (!s) return 'Chưa dùng';
  try { return new Date(s).toLocaleString('vi-VN'); } catch { return s; }
}

export default function ApiKeys() {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [newKey, setNewKey] = useState(null); // {name, api_key} — chỉ hiện 1 lần
  const [showGuide, setShowGuide] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const r = await api('/api-keys');
      setKeys(Array.isArray(r) ? r : (r.data || []));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function create() {
    if (!name.trim()) { alert('Nhập tên cho key (VD: Facebook Ads)'); return; }
    setSaving(true);
    try {
      const r = await api('/api-keys', { method: 'POST', body: JSON.stringify({ name: name.trim() }) });
      setNewKey(r); // {id, name, api_key, key_prefix}
      setShowForm(false);
      setName('');
      load();
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(k) {
    try {
      await api(`/api-keys/${k.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: !k.is_active }) });
      load();
    } catch (e) {
      alert(e.message);
    }
  }

  async function remove(k) {
    if (!window.confirm(`Xóa key "${k.name}"? Các tích hợp dùng key này sẽ ngừng hoạt động.`)) return;
    try {
      await api(`/api-keys/${k.id}`, { method: 'DELETE' });
      load();
    } catch (e) {
      alert(e.message);
    }
  }

  return (
    <>
      <div className="header"><h1>🔑 API Keys</h1><div className="sub">Webhook nhận lead tự động từ ứng dụng ngoài</div></div>

      <div className="field">
        <button className="btn" onClick={() => setShowForm(true)}>+ Tạo key mới</button>
      </div>

      {error && <ErrorBox message={error} onRetry={load} />}
      {loading && <Loading />}
      {!loading && !error && keys.length === 0 && <Empty icon="🔑" text="Chưa có API key nào" />}

      {!loading && keys.map((k) => (
        <div key={k.id} className="card">
          <div className="row between">
            <div style={{ fontWeight: 700 }}>{k.name}</div>
            <span className={`badge ${k.is_active ? 'badge-green' : 'badge-gray'}`}>
              {k.is_active ? 'Đang bật' : 'Đã tắt'}
            </span>
          </div>
          <div className="muted mt" style={{ fontFamily: 'monospace' }}>{k.key_prefix}••••••••</div>
          <div className="muted">Lần dùng cuối: {fmtDateTime(k.last_used_at)}</div>
          <div className="row mt" style={{ gap: 8 }}>
            <button className="btn btn-outline" onClick={() => toggle(k)}>
              {k.is_active ? '⏸️ Tắt' : '▶️ Bật'}
            </button>
            <button className="btn btn-danger-outline" onClick={() => remove(k)}>🗑️ Xóa</button>
          </div>
        </div>
      ))}

      <div className="card tappable" style={{ marginTop: 16 }} onClick={() => setShowGuide(!showGuide)}>
        <div className="row between">
          <div style={{ fontWeight: 700 }}>📖 Hướng dẫn tích hợp</div>
          <div className="muted">{showGuide ? '▲' : '▼'}</div>
        </div>
      </div>
      {showGuide && (
        <div className="card">
          <div className="muted" style={{ marginBottom: 8 }}>
            Gửi lead mới vào hệ thống từ website, Facebook Ads, landing page...
          </div>
          <pre style={{
            background: '#172744', color: '#f5f5f5', borderRadius: 8, padding: 12,
            fontSize: 12, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}>{SAMPLE_CODE}</pre>
          <div className="field" style={{ marginTop: 8 }}>
            <button className="btn btn-outline" onClick={() => copyText(SAMPLE_CODE)}>📋 Copy mẫu</button>
          </div>
        </div>
      )}

      {showForm && (
        <Modal title="➕ Tạo API key mới" onClose={() => setShowForm(false)}>
          <div className="field">
            <label>Tên key *</label>
            <input
              className="input" placeholder="VD: Facebook Ads, Website, Landing page..."
              value={name} onChange={(e) => setName(e.target.value)} autoFocus
            />
          </div>
          <div className="field">
            <button className="btn" disabled={saving} onClick={create}>
              {saving ? 'Đang tạo...' : 'Tạo key'}
            </button>
          </div>
          <div className="field">
            <button className="btn btn-outline" onClick={() => setShowForm(false)}>Hủy</button>
          </div>
        </Modal>
      )}

      {newKey && (
        <Modal title="✅ Key đã tạo — lưu ngay!" onClose={() => setNewKey(null)}>
          <div className="error-box" style={{ marginBottom: 12 }}>
            ⚠️ Key đầy đủ <b>chỉ hiện 1 lần duy nhất</b>. Hãy copy và lưu lại ngay, đóng modal là không xem lại được.
          </div>
          <div className="field">
            <label>{newKey.name}</label>
            <div style={{
              background: '#172744', color: '#f4a522', borderRadius: 8, padding: 12,
              fontFamily: 'monospace', fontSize: 14, wordBreak: 'break-all',
            }}>{newKey.api_key}</div>
          </div>
          <div className="field">
            <button className="btn" onClick={() => copyText(newKey.api_key)}>📋 Copy key</button>
          </div>
          <div className="field">
            <button className="btn btn-outline" onClick={() => setNewKey(null)}>Đã lưu xong</button>
          </div>
        </Modal>
      )}
    </>
  );
}
