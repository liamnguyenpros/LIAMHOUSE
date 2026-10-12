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

const ROLE_LABELS = { sale: 'Sale', team_lead: 'Trưởng phòng', floor_director: 'GĐ sàn' };
const TYPE_LABELS = { ca_nhan: 'Cá nhân', doi_nhom: 'Đội nhóm' };
const STATUS_META = {
  active: { label: 'Đang áp dụng', badge: 'badge-green' },
  inactive: { label: 'Tạm dừng', badge: 'badge-gray' },
};

const EMPTY_FORM = { name: '', project_id: '', role: 'sale', commission_type: 'ca_nhan', rate: '', valid_from: '', valid_to: '', status: 'active' };

export default function CommissionRules() {
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
      const r = await api('/commission-rules');
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

  function openEdit(r) {
    setEditing(r);
    setForm({
      name: r.name || '',
      project_id: r.project_id || '',
      role: r.role || 'sale',
      commission_type: r.commission_type || 'ca_nhan',
      rate: r.rate ?? '',
      valid_from: r.valid_from ? r.valid_from.slice(0, 10) : '',
      valid_to: r.valid_to ? r.valid_to.slice(0, 10) : '',
      status: r.status || 'active',
    });
    setShowForm(true);
  }

  async function save(e) {
    e.preventDefault();
    if (!form.name.trim()) { alert('Nhập tên rule'); return; }
    if (form.rate === '' || Number(form.rate) <= 0) { alert('Nhập tỷ lệ % hợp lệ'); return; }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        project_id: form.project_id || null,
        role: form.role,
        commission_type: form.commission_type,
        rate: Number(form.rate),
        valid_from: form.valid_from || null,
        valid_to: form.valid_to || null,
        status: form.status,
      };
      if (editing) {
        await api(`/commission-rules/${editing.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        await api('/commission-rules', { method: 'POST', body: JSON.stringify(body) });
      }
      setShowForm(false);
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(r) {
    if (!window.confirm(`Xóa rule "${r.name}"?`)) return;
    try {
      await api(`/commission-rules/${r.id}`, { method: 'DELETE' });
      load();
    } catch (e) {
      alert(e.message);
    }
  }

  async function toggleStatus(r) {
    const next = r.status === 'active' ? 'inactive' : 'active';
    try {
      await api(`/commission-rules/${r.id}`, { method: 'PATCH', body: JSON.stringify({ status: next }) });
      load();
    } catch (e) {
      alert(e.message);
    }
  }

  function projectName(pid) {
    if (!pid) return 'Tất cả dự án';
    const pr = projects.find((x) => x.id === pid);
    return pr ? pr.name : '—';
  }

  return (
    <>
      <div className="header">
        <h1>⚙️ Cấu hình hoa hồng</h1>
        <div className="sub">Tỷ lệ % hoa hồng theo dự án & vai trò</div>
      </div>

      <div className="field">
        <button className="btn btn-primary" onClick={openAdd}>➕ Thêm rule</button>
      </div>

      {error && <ErrorBox message={error} onRetry={load} />}
      {loading && <Loading />}
      {!loading && !error && rows.length === 0 && <Empty icon="⚙️" text="Chưa có rule nào" />}

      {!loading && !error && rows.map((r) => {
        const sm = STATUS_META[r.status] || STATUS_META.active;
        return (
          <div className="card" key={r.id}>
            <div className="row between">
              <div style={{ fontWeight: 700 }}>{r.name}</div>
              <span className={`badge ${sm.badge}`}>{sm.label}</span>
            </div>
            <div className="row mt" style={{ gap: 8, flexWrap: 'wrap' }}>
              <span className="chip" style={{ fontWeight: 800, fontSize: 16, color: '#172744' }}>{r.rate}%</span>
              <span className="chip">{TYPE_LABELS[r.commission_type] || r.commission_type}</span>
              <span className="chip">{ROLE_LABELS[r.role] || r.role}</span>
            </div>
            <div className="muted mt">📁 {projectName(r.project_id)}</div>
            {(r.valid_from || r.valid_to) && (
              <div className="muted mt" style={{ fontSize: 13 }}>
                📅 {r.valid_from ? fmtDate(r.valid_from) : '…'} → {r.valid_to ? fmtDate(r.valid_to) : '…'}
              </div>
            )}
            <div className="row mt" style={{ gap: 8 }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => openEdit(r)}>✏️ Sửa</button>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => toggleStatus(r)}>
                {r.status === 'active' ? '⏸️ Tạm dừng' : '▶️ Bật lại'}
              </button>
              <button className="btn btn-danger-outline" style={{ flex: 1 }} onClick={() => remove(r)}>🗑️</button>
            </div>
          </div>
        );
      })}

      {showForm && (
        <Modal title={editing ? '✏️ Sửa rule' : '➕ Thêm rule hoa hồng'} onClose={() => setShowForm(false)}>
          <form onSubmit={save}>
            <div className="field">
              <label>Tên rule *</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="VD: HH sale dự án Vinhomes" />
            </div>
            <div className="field">
              <label>Dự án</label>
              <select className="input" value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })}>
                <option value="">— Tất cả dự án —</option>
                {projects.map((pr) => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
              </select>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <div className="field grow">
                <label>Vai trò</label>
                <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  <option value="sale">Sale</option>
                  <option value="team_lead">Trưởng phòng</option>
                  <option value="floor_director">GĐ sàn</option>
                </select>
              </div>
              <div className="field grow">
                <label>Loại</label>
                <select className="input" value={form.commission_type} onChange={(e) => setForm({ ...form, commission_type: e.target.value })}>
                  <option value="ca_nhan">Cá nhân</option>
                  <option value="doi_nhom">Đội nhóm</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label>Tỷ lệ (%) *</label>
              <input className="input" inputMode="decimal" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value.replace(/[^\d.]/g, '') })} placeholder="VD: 3" />
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
              <label>Trạng thái</label>
              <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="active">Đang áp dụng</option>
                <option value="inactive">Tạm dừng</option>
              </select>
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
