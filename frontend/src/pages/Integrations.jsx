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

const PROVIDER_LABELS = {
  stringee: 'Stringee',
  vht: 'VHT',
  custom: 'Tùy chỉnh',
};

const EMPTY_FORM = { provider: 'stringee', api_key: '', hotline: '', record: true, is_active: true };

export default function Integrations() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState({});

  async function load() {
    setLoading(true);
    setError('');
    try {
      const r = await api('/integrations');
      setRows(Array.isArray(r) ? r : (r.data || []));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(it) {
    setEditing(it);
    setForm({
      provider: it.provider || 'stringee',
      api_key: '', // không hiện key cũ, chỉ nhập khi muốn đổi
      hotline: it.settings?.hotline || it.hotline || '',
      record: it.settings?.record !== false,
      is_active: it.is_active !== false,
    });
    setShowForm(true);
  }

  async function save(e) {
    e.preventDefault();
    if (!editing && !form.api_key.trim()) { alert('Nhập API key'); return; }
    setSaving(true);
    try {
      const body = {
        provider: form.provider,
        settings: { hotline: form.hotline.trim() || null, record: form.record },
        is_active: form.is_active,
      };
      if (form.api_key.trim()) body.api_key = form.api_key.trim();
      if (editing) {
        await api(`/integrations/${editing.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        await api('/integrations', { method: 'POST', body: JSON.stringify(body) });
      }
      setShowForm(false);
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(it) {
    try {
      await api(`/integrations/${it.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: !it.is_active }) });
      load();
    } catch (e) {
      alert(e.message);
    }
  }

  async function remove(it) {
    if (!window.confirm(`Xóa tích hợp ${PROVIDER_LABELS[it.provider] || it.provider}?`)) return;
    try {
      await api(`/integrations/${it.id}`, { method: 'DELETE' });
      load();
    } catch (e) {
      alert(e.message);
    }
  }

  function hotlineOf(it) {
    return it.settings?.hotline || it.hotline || '—';
  }

  return (
    <>
      <div className="header">
        <h1>🔌 Tích hợp gọi điện</h1>
        <div className="sub">Kết nối tổng đài để gọi trực tiếp từ app</div>
      </div>

      <div className="field">
        <button className="btn btn-primary" onClick={openAdd}>➕ Thêm tích hợp</button>
      </div>

      {error && <ErrorBox message={error} onRetry={load} />}
      {loading && <Loading />}
      {!loading && !error && rows.length === 0 && <Empty icon="🔌" text="Chưa cấu hình tổng đài nào" />}

      {!loading && !error && rows.map((it) => (
        <div className="card" key={it.id} style={{ opacity: it.is_active === false ? 0.6 : 1 }}>
          <div className="row between">
            <div style={{ fontWeight: 700, fontSize: 17 }}>
              {it.provider === 'stringee' ? '📡' : it.provider === 'vht' ? '📞' : '🔧'} {PROVIDER_LABELS[it.provider] || it.provider}
            </div>
            <span className={`badge ${it.is_active === false ? 'badge-gray' : 'badge-green'}`}>
              {it.is_active === false ? 'Tắt' : 'Đang bật'}
            </span>
          </div>
          <div className="muted mt">☎️ Hotline: {hotlineOf(it)}</div>
          <div className="muted mt" style={{ fontSize: 13 }}>
            🔑 API key: <code>{showKey[it.id] ? (it.api_key || '(đã lưu)') : (it.api_key_masked || '••••••••')}</code>
            {' '}
            <button
              type="button"
              onClick={() => setShowKey({ ...showKey, [it.id]: !showKey[it.id] })}
              style={{ background: 'none', border: 'none', color: '#F5A623', fontSize: 13, cursor: 'pointer' }}
            >
              {showKey[it.id] ? 'Ẩn' : 'Hiện'}
            </button>
          </div>
          {it.settings?.record && <div className="muted mt" style={{ fontSize: 13 }}>⏺️ Bật ghi âm cuộc gọi</div>}
          <div className="row mt" style={{ gap: 8 }}>
            <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => openEdit(it)}>✏️ Sửa</button>
            <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => toggleActive(it)}>
              {it.is_active === false ? '▶️ Bật' : '⏸️ Tắt'}
            </button>
            <button className="btn btn-danger-outline" style={{ flex: 1 }} onClick={() => remove(it)}>🗑️</button>
          </div>
        </div>
      ))}

      {showForm && (
        <Modal title={editing ? '✏️ Sửa tích hợp' : '➕ Thêm tích hợp tổng đài'} onClose={() => setShowForm(false)}>
          <form onSubmit={save}>
            <div className="field">
              <label>Nhà cung cấp</label>
              <select className="input" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })}>
                <option value="stringee">Stringee</option>
                <option value="vht">VHT</option>
                <option value="custom">Tùy chỉnh</option>
              </select>
            </div>
            <div className="field">
              <label>API key {editing ? '(để trống nếu không đổi)' : '*'}</label>
              <input className="input" type="password" value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} placeholder="Nhập API key của tổng đài" autoComplete="new-password" />
            </div>
            <div className="field">
              <label>Hotline / đầu số</label>
              <input className="input" value={form.hotline} onChange={(e) => setForm({ ...form, hotline: e.target.value })} placeholder="VD: 1900xxxx" />
            </div>
            <div className="field">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.record} onChange={(e) => setForm({ ...form, record: e.target.checked })} style={{ width: 20, height: 20 }} />
                Bật ghi âm cuộc gọi
              </label>
            </div>
            <div className="field">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} style={{ width: 20, height: 20 }} />
                Kích hoạt ngay
              </label>
            </div>
            <div className="field">
              <button className="btn btn-primary" disabled={saving}>{saving ? 'Đang lưu...' : '💾 Lưu'}</button>
            </div>
            <div className="field">
              <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Hủy</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
