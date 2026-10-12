import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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

const STATUS_OPTIONS = [
  { value: 'dang_mo_ban', label: 'Đang mở bán' },
  { value: 'sap_mo_ban', label: 'Sắp mở bán' },
];

const EMPTY_FORM = { name: '', location: '', developer: '', description: '', status: 'dang_mo_ban' };

export default function Projects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      setProjects(await api('/projects'));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save(e) {
    e.preventDefault();
    if (!form.name.trim()) { alert('Nhập tên dự án'); return; }
    setSaving(true);
    try {
      await api('/projects', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          location: form.location.trim() || null,
          developer: form.developer.trim() || null,
          description: form.description.trim() || null,
          status: form.status,
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

  return (
    <>
      <div className="header"><h1>🏢 Dự án</h1><div className="sub">{projects.length} dự án đang mở bán</div></div>

      <div className="field">
        <button className="btn" onClick={() => setShowForm(true)}>+ Thêm dự án</button>
      </div>

      {error && <ErrorBox message={error} onRetry={load} />}
      {loading && <Loading />}
      {!loading && !error && projects.length === 0 && <Empty icon="🏢" text="Chưa có dự án nào" />}

      {!loading && projects.map((p) => (
        <Link key={p.id} to={`/du-an/${p.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="card tappable">
            <div style={{ fontWeight: 800, fontSize: 17 }}>{p.name}</div>
            <div className="muted">📍 {p.location || '—'}</div>
            <div className="muted">🏗️ Chủ đầu tư: {p.developer || '—'}</div>
            <div className="row mt">
              <span className="badge badge-green">Còn {p.can_con_trong} căn trống</span>
            </div>
          </div>
        </Link>
      ))}

      {showForm && (
        <Modal title="➕ Thêm dự án mới" onClose={() => setShowForm(false)}>
          <form onSubmit={save}>
            <div className="field">
              <label>Tên dự án *</label>
              <input className="input" placeholder="VD: Vinhomes Grand Park" value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus />
            </div>
            <div className="field">
              <label>Địa điểm</label>
              <input className="input" placeholder="VD: Thủ Đức, TP.HCM" value={form.location} onChange={(e) => set('location', e.target.value)} />
            </div>
            <div className="field">
              <label>Chủ đầu tư</label>
              <input className="input" placeholder="VD: Vinhomes" value={form.developer} onChange={(e) => set('developer', e.target.value)} />
            </div>
            <div className="field">
              <label>Mô tả</label>
              <textarea className="input" rows={3} placeholder="Thông tin tổng quan dự án..." value={form.description} onChange={(e) => set('description', e.target.value)} />
            </div>
            <div className="field">
              <label>Trạng thái</label>
              <select className="input" value={form.status} onChange={(e) => set('status', e.target.value)}>
                {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="field">
              <button className="btn" type="submit" disabled={saving}>{saving ? 'Đang lưu...' : 'Tạo dự án'}</button>
            </div>
            <div className="field">
              <button className="btn btn-outline" type="button" onClick={() => setShowForm(false)}>Hủy</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
