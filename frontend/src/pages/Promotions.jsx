import { useEffect, useState } from 'react';
import { api, fmtDate } from '../api.js';
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

function isActive(p) {
  if (!p.valid_from && !p.valid_to) return true;
  const now = new Date();
  if (p.valid_from && new Date(p.valid_from) > now) return false;
  if (p.valid_to && new Date(p.valid_to) < now) return false;
  return true;
}

const EMPTY_FORM = { project_id: '', name: '', discount_rate: '', gift: '', valid_from: '', valid_to: '' };

export default function Promotions() {
  const [rows, setRows] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const r = await api('/price-policies');
      setRows(Array.isArray(r) ? r : (r.data || []));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadProjects() {
    try {
      const r = await api('/projects');
      setProjects(Array.isArray(r) ? r : (r.data || []));
    } catch { /* bỏ qua */ }
  }

  useEffect(() => { load(); loadProjects(); }, []);

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(p) {
    setEditing(p);
    setForm({
      project_id: p.project_id || '',
      name: p.name || '',
      discount_rate: p.discount_rate ?? '',
      gift: p.gift || '',
      valid_from: p.valid_from ? p.valid_from.slice(0, 10) : '',
      valid_to: p.valid_to ? p.valid_to.slice(0, 10) : '',
    });
    setShowForm(true);
  }

  async function save(e) {
    e.preventDefault();
    if (!form.name.trim()) { alert('Nhập tên chính sách'); return; }
    setSaving(true);
    try {
      const body = {
        project_id: form.project_id || null,
        name: form.name.trim(),
        discount_rate: form.discount_rate === '' ? null : Number(form.discount_rate),
        gift: form.gift.trim() || null,
        valid_from: form.valid_from || null,
        valid_to: form.valid_to || null,
      };
      if (editing) {
        await api(`/price-policies/${editing.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        await api('/price-policies', { method: 'POST', body: JSON.stringify(body) });
      }
      setShowForm(false);
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(p) {
    if (!window.confirm(`Xóa chính sách "${p.name}"?`)) return;
    try {
      await api(`/price-policies/${p.id}`, { method: 'DELETE' });
      load();
    } catch (e) {
      alert(e.message);
    }
  }

  function projectName(pid) {
    const pr = projects.find((x) => x.id === pid);
    return pr ? pr.name : '—';
  }

  return (
    <>
      <div className="header">
        <h1>🏷️ Khuyến mãi</h1>
        <div className="sub">Chính sách giá & quà tặng theo dự án</div>
      </div>

      <div className="field">
        <button className="btn btn-primary" onClick={openAdd}>➕ Thêm chính sách</button>
      </div>

      {error && <ErrorBox message={error} onRetry={load} />}
      {loading && <Loading />}
      {!loading && !error && rows.length === 0 && <Empty icon="🏷️" text="Chưa có chính sách nào" />}

      {!loading && !error && rows.map((p) => {
        const active = isActive(p);
        return (
          <div className="card" key={p.id}>
            <div className="row between">
              <div style={{ fontWeight: 700 }}>{p.name}</div>
              <span className={`badge ${active ? 'badge-green' : 'badge-gray'}`}>
                {active ? 'Còn hiệu lực' : 'Hết hạn'}
              </span>
            </div>
            <div className="muted mt">📁 {projectName(p.project_id)}</div>
            <div className="row mt" style={{ gap: 8, flexWrap: 'wrap' }}>
              {p.discount_rate != null && (
                <span className="chip" style={{ fontWeight: 800, color: '#172744' }}>−{p.discount_rate}%</span>
              )}
              {p.gift && <span className="chip">🎁 {p.gift}</span>}
            </div>
            {(p.valid_from || p.valid_to) && (
              <div className="muted mt" style={{ fontSize: 13 }}>
                📅 {p.valid_from ? fmtDate(p.valid_from) : '…'} → {p.valid_to ? fmtDate(p.valid_to) : '…'}
              </div>
            )}
            <div className="row mt" style={{ gap: 8 }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => openEdit(p)}>✏️ Sửa</button>
              <button className="btn btn-danger-outline" style={{ flex: 1 }} onClick={() => remove(p)}>🗑️ Xóa</button>
            </div>
          </div>
        );
      })}

      {showForm && (
        <Modal title={editing ? '✏️ Sửa chính sách' : '➕ Thêm chính sách'} onClose={() => setShowForm(false)}>
          <form onSubmit={save}>
            <div className="field">
              <label>Dự án</label>
              <select className="input" value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })}>
                <option value="">— Tất cả dự án —</option>
                {projects.map((pr) => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Tên chính sách *</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="VD: Chiết khấu mở bán đợt 1" />
            </div>
            <div className="field">
              <label>Chiết khấu (%)</label>
              <input className="input" inputMode="decimal" value={form.discount_rate} onChange={(e) => setForm({ ...form, discount_rate: e.target.value.replace(/[^\d.]/g, '') })} placeholder="VD: 2.5" />
            </div>
            <div className="field">
              <label>Quà tặng</label>
              <input className="input" value={form.gift} onChange={(e) => setForm({ ...form, gift: e.target.value })} placeholder="VD: Tặng gói nội thất 100tr" />
            </div>
            <div className="row" style={{ gap: 8 }}>
              <div className="field grow">
                <label>Từ ngày</label>
                <input className="input" type="date" value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} />
              </div>
              <div className="field grow">
                <label>Đến ngày</label>
                <input className="input" type="date" value={form.valid_to} onChange={(e) => setForm({ ...form, valid_to: e.target.value })} />
              </div>
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
