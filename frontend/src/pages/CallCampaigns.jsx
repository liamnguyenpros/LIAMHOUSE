import { useEffect, useState } from 'react';
import { api, fmtDate, fmtDateTime } from '../api.js';
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

const STATUS_META = {
  draft: { label: 'Nháp', badge: 'badge-gray' },
  running: { label: 'Đang chạy', badge: 'badge-green' },
  paused: { label: 'Tạm dừng', badge: 'badge-amber' },
  done: { label: 'Hoàn thành', badge: 'badge-score-hi' },
  cancelled: { label: 'Đã hủy', badge: 'badge-gray' },
};

const EMPTY_FORM = { name: '', lead_status: '', older_than_days: '', assigned_to: '' };

export default function CallCampaigns() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewLeads, setPreviewLeads] = useState([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const r = await api('/call-campaigns');
      setRows(Array.isArray(r) ? r : (r.data || []));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function save(e) {
    e.preventDefault();
    if (!form.name.trim()) { alert('Nhập tên chiến dịch'); return; }
    setSaving(true);
    try {
      await api('/call-campaigns', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          lead_status: form.lead_status || null,
          older_than_days: form.older_than_days === '' ? null : Number(form.older_than_days),
          assigned_to: form.assigned_to || null,
        }),
      });
      setShowForm(false);
      setForm(EMPTY_FORM);
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(c, status) {
    const labels = { running: 'chạy', paused: 'tạm dừng', cancelled: 'hủy' };
    if (!window.confirm(`${labels[status] ? 'Xác nhận ' + labels[status] : 'Đổi trạng thái'} chiến dịch "${c.name}"?`)) return;
    try {
      await api(`/call-campaigns/${c.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      load();
    } catch (e) {
      alert(e.message);
    }
  }

  async function remove(c) {
    if (!window.confirm(`Xóa chiến dịch "${c.name}"?`)) return;
    try {
      await api(`/call-campaigns/${c.id}`, { method: 'DELETE' });
      load();
    } catch (e) {
      alert(e.message);
    }
  }

  async function openPreview(c) {
    setPreview(c);
    setPreviewLeads([]);
    setPreviewLoading(true);
    try {
      const r = await api(`/call-campaigns/${c.id}/leads`);
      setPreviewLeads(Array.isArray(r) ? r : (r.data || []));
    } catch (e) {
      alert(e.message);
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }

  return (
    <>
      <div className="header">
        <h1>📞 Chiến dịch gọi</h1>
        <div className="sub">Gọi hàng loạt theo danh sách lead</div>
      </div>

      <div className="field">
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>➕ Tạo chiến dịch</button>
      </div>

      {error && <ErrorBox message={error} onRetry={load} />}
      {loading && <Loading />}
      {!loading && !error && rows.length === 0 && <Empty icon="📞" text="Chưa có chiến dịch nào" />}

      {!loading && !error && rows.map((c) => {
        const sm = STATUS_META[c.status] || { label: c.status, badge: 'badge-gray' };
        return (
          <div className="card" key={c.id}>
            <div className="row between">
              <div style={{ fontWeight: 700 }}>{c.name}</div>
              <span className={`badge ${sm.badge}`}>{sm.label}</span>
            </div>
            <div className="muted mt">
              👥 {c.lead_count ?? 0} lead
              {c.created_at && ` · tạo ${fmtDate(c.created_at)}`}
            </div>
            {(c.total_calls != null || c.success_calls != null) && (
              <div className="muted mt" style={{ fontSize: 13 }}>
                📊 Đã gọi {c.total_calls ?? 0}, thành công {c.success_calls ?? 0}
              </div>
            )}
            <div className="row mt" style={{ gap: 8 }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => openPreview(c)}>👁️ Xem lead</button>
              {(c.status === 'draft' || c.status === 'paused') && (
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setStatus(c, 'running')}>▶️ Chạy</button>
              )}
              {c.status === 'running' && (
                <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setStatus(c, 'paused')}>⏸️ Dừng</button>
              )}
              {(c.status === 'draft' || c.status === 'paused') && (
                <button className="btn btn-danger-outline" style={{ flex: 1 }} onClick={() => remove(c)}>🗑️</button>
              )}
            </div>
          </div>
        );
      })}

      {showForm && (
        <Modal title="➕ Tạo chiến dịch gọi" onClose={() => setShowForm(false)}>
          <form onSubmit={save}>
            <div className="field">
              <label>Tên chiến dịch *</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="VD: Gọi lại lead cũ tháng 9" />
            </div>
            <div className="section-title">🎯 Tiêu chí chọn lead</div>
            <div className="field">
              <label>Trạng thái lead</label>
              <select className="input" value={form.lead_status} onChange={(e) => setForm({ ...form, lead_status: e.target.value })}>
                <option value="">— Tất cả —</option>
                <option value="moi">Mới</option>
                <option value="da_lien_he">Đã liên hệ</option>
                <option value="dang_tu_van">Đang tư vấn</option>
                <option value="da_dan_xem">Đã dẫn xem</option>
              </select>
            </div>
            <div className="field">
              <label>Lead cũ hơn (ngày)</label>
              <input className="input" inputMode="numeric" value={form.older_than_days} onChange={(e) => setForm({ ...form, older_than_days: e.target.value.replace(/[^\d]/g, '') })} placeholder="VD: 7" />
            </div>
            <div className="field">
              <button className="btn btn-primary" disabled={saving}>{saving ? 'Đang tạo...' : '💾 Tạo chiến dịch'}</button>
            </div>
            <div className="field">
              <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Hủy</button>
            </div>
          </form>
        </Modal>
      )}

      {preview && (
        <Modal title={`👥 Lead trong "${preview.name}"`} onClose={() => setPreview(null)}>
          {previewLoading && <Loading />}
          {!previewLoading && previewLeads.length === 0 && <Empty icon="👥" text="Không có lead nào" />}
          {!previewLoading && previewLeads.map((l) => (
            <div className="card" key={l.id} style={{ margin: '8px 0' }}>
              <div style={{ fontWeight: 700 }}>{l.full_name || l.name}</div>
              <div className="muted">📱 {l.phone}</div>
              {l.stage && <div className="muted" style={{ fontSize: 13 }}>Giai đoạn: {l.stage}</div>}
            </div>
          ))}
          <div className="field" style={{ marginTop: 12 }}>
            <button className="btn btn-outline" onClick={() => setPreview(null)}>Đóng</button>
          </div>
        </Modal>
      )}
    </>
  );
}
