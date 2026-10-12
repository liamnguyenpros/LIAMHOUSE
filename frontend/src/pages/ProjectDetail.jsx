import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, fmtMoney, fmtDateTime, DOC_TYPE_LABELS } from '../api.js';
import { Loading, ErrorBox, Empty, PropertyStatusBadge } from '../components/ui.jsx';

const DOC_TABS = ['phap_ly', 'mat_bang', 'tien_do'];

function Modal({ title, onClose, children }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(23,39,68,0.55)', display: 'flex',
      alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onClose}>
      <div className="card" style={{ width: '100%', maxWidth: 480, margin: 0, borderRadius: '16px 16px 0 0', maxHeight: '88vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="section-title" style={{ marginBottom: 12 }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

const PROPERTY_TYPES = [
  { value: 'can_ho', label: 'Căn hộ' },
  { value: 'nha_pho', label: 'Nhà phố' },
  { value: 'dat_nen', label: 'Đất nền' },
  { value: 'shophouse', label: 'Shophouse' },
  { value: 'biet_thu', label: 'Biệt thự' },
  { value: 'officetel', label: 'Officetel' },
];

const PROPERTY_STATUSES = [
  { value: 'dang_ban', label: 'Trống' },
  { value: 'giu_cho', label: 'Giữ chỗ' },
  { value: 'dat_coc', label: 'Đã cọc' },
  { value: 'da_ban', label: 'Đã bán' },
];

const EMPTY_FORM = { code: '', type: 'can_ho', area: '', bedrooms: '', direction: '', floor: '', price: '', status: 'dang_ban' };

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [docs, setDocs] = useState([]);
  const [error, setError] = useState('');
  const [docTab, setDocTab] = useState('phap_ly');
  // form thêm tài liệu
  const [dTitle, setDTitle] = useState('');
  const [dDesc, setDDesc] = useState('');
  const [dUrl, setDUrl] = useState('');
  const [dSaving, setDSaving] = useState(false);
  // quản lý sản phẩm
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  async function load() {
    setError('');
    try {
      setProject(await api(`/projects/${id}`));
    } catch (e) {
      setError(e.message);
    }
  }

  async function loadDocs(tab) {
    try {
      setDocs(await api(`/projects/${id}/docs?doc_type=${tab}`));
    } catch (e) {
      setDocs([]);
    }
  }

  async function loadProducts() {
    setLoadingProducts(true);
    try {
      const r = await api(`/properties?project_id=${id}`);
      setProducts(Array.isArray(r) ? r : (r.data || []));
    } catch (e) {
      setProducts([]);
    } finally {
      setLoadingProducts(false);
    }
  }

  useEffect(() => { load(); loadProducts(); }, [id]);
  useEffect(() => { loadDocs(docTab); }, [id, docTab]);

  async function addDoc(e) {
    e.preventDefault();
    if (!dTitle.trim()) return alert('Vui lòng nhập tiêu đề tài liệu');
    setDSaving(true);
    try {
      await api(`/projects/${id}/docs`, {
        method: 'POST',
        body: JSON.stringify({ doc_type: docTab, title: dTitle.trim(), description: dDesc.trim(), file_url: dUrl.trim() }),
      });
      setDTitle(''); setDDesc(''); setDUrl('');
      loadDocs(docTab);
    } catch (e2) {
      alert(e2.message);
    } finally {
      setDSaving(false);
    }
  }

  async function shareZalo() {
    try {
      const r = await api('/share/zalo', { method: 'POST', body: JSON.stringify({ type: 'project', id }) });
      window.open('https://zalo.me/share?url=' + encodeURIComponent(r.share_url), '_blank');
    } catch (e) {
      alert(e.message);
    }
  }

  // ---- quản lý sản phẩm ----
  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(p) {
    setEditing(p);
    setForm({
      code: p.code || '',
      type: p.type || 'can_ho',
      area: p.area || '',
      bedrooms: p.bedrooms ?? '',
      direction: p.direction || '',
      floor: p.floor ?? '',
      price: p.price || '',
      status: p.status || 'dang_ban',
    });
    setShowForm(true);
  }

  async function saveProduct(e) {
    e.preventDefault();
    if (!form.code.trim()) return alert('Vui lòng nhập mã căn');
    if (!form.price || Number(form.price) <= 0) return alert('Vui lòng nhập giá hợp lệ');
    setSaving(true);
    try {
      const body = {
        project_id: id,
        code: form.code.trim(),
        type: form.type,
        area: form.area === '' ? null : Number(form.area),
        bedrooms: form.bedrooms === '' ? null : Number(form.bedrooms),
        direction: form.direction.trim() || null,
        floor: form.floor === '' ? null : Number(form.floor),
        price: Number(form.price),
        status: form.status,
      };
      if (editing) {
        await api(`/properties/${editing.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        await api('/properties', { method: 'POST', body: JSON.stringify(body) });
      }
      setShowForm(false);
      loadProducts();
    } catch (e2) {
      alert(e2.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteProduct(p) {
    if (!window.confirm(`Xóa sản phẩm "${p.code}"?`)) return;
    try {
      await api(`/properties/${p.id}`, { method: 'DELETE' });
      loadProducts();
    } catch (e2) {
      alert(e2.message);
    }
  }

  const filtered = statusFilter === 'all' ? products : products.filter((p) => p.status === statusFilter);

  if (error) return (<><div className="header"><button className="back" onClick={() => navigate(-1)}>← Quay lại</button></div><ErrorBox message={error} onRetry={load} /></>);
  if (!project) return (<><div className="header"><button className="back" onClick={() => navigate(-1)}>← Quay lại</button></div><Loading /></>);

  return (
    <>
      <div className="header">
        <button className="back" onClick={() => navigate(-1)}>← Quay lại</button>
        <h1 style={{ marginTop: 4 }}>{project.name}</h1>
        <div className="sub">📍 {project.location} · 🏗️ {project.developer}</div>
      </div>

      <div className="field">
        <button className="btn btn-outline" onClick={shareZalo}>🔗 Chia sẻ dự án qua Zalo</button>
      </div>

      <div className="section-title">📁 Hồ sơ dự án</div>
      <div className="tabs">
        {DOC_TABS.map((t) => (
          <button key={t} className={`tab ${docTab === t ? 'active' : ''}`} onClick={() => setDocTab(t)}>
            {DOC_TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {docs.length === 0 && <Empty icon="📄" text={`Chưa có tài liệu ${DOC_TYPE_LABELS[docTab].toLowerCase()}`} />}
      {docs.map((d) => (
        <div className="card" key={d.id}>
          <div style={{ fontWeight: 700 }}>📄 {d.title}</div>
          {d.description && <div>{d.description}</div>}
          {d.file_url && <div className="muted">🔗 {d.file_url}</div>}
          <div className="muted">{fmtDateTime(d.created_at)}</div>
        </div>
      ))}

      <div className="section-title">➕ Thêm tài liệu {DOC_TYPE_LABELS[docTab].toLowerCase()}</div>
      <form onSubmit={addDoc}>
        <div className="field"><input className="input" placeholder="Tiêu đề tài liệu *" value={dTitle} onChange={(e) => setDTitle(e.target.value)} /></div>
        <div className="field"><input className="input" placeholder="Mô tả (không bắt buộc)" value={dDesc} onChange={(e) => setDDesc(e.target.value)} /></div>
        <div className="field"><input className="input" placeholder="Link file (không bắt buộc)" value={dUrl} onChange={(e) => setDUrl(e.target.value)} /></div>
        <div className="field"><button className="btn btn-primary" disabled={dSaving}>{dSaving ? 'Đang lưu...' : '💾 Thêm tài liệu'}</button></div>
      </form>

      <div className="row between" style={{ alignItems: 'center' }}>
        <div className="section-title" style={{ margin: 0 }}>🏠 Sản phẩm / Giỏ hàng ({products.length} căn)</div>
        <button className="btn btn-primary" style={{ width: 'auto', padding: '8px 14px', fontSize: 14 }} onClick={openAdd}>+ Thêm sản phẩm</button>
      </div>

      <div className="tabs" style={{ marginTop: 8 }}>
        <button className={`tab ${statusFilter === 'all' ? 'active' : ''}`} onClick={() => setStatusFilter('all')}>Tất cả ({products.length})</button>
        {PROPERTY_STATUSES.map((s) => {
          const n = products.filter((p) => p.status === s.value).length;
          return (
            <button key={s.value} className={`tab ${statusFilter === s.value ? 'active' : ''}`} onClick={() => setStatusFilter(s.value)}>
              {s.label} ({n})
            </button>
          );
        })}
      </div>

      {loadingProducts && <Loading />}
      {!loadingProducts && filtered.length === 0 && <Empty icon="🏠" text="Chưa có sản phẩm nào" />}

      {!loadingProducts && filtered.map((c) => (
        <div className="card" key={c.id}>
          <div className="row between">
            <div className="grow">
              <div style={{ fontWeight: 800, fontSize: 17 }}>Căn {c.code}</div>
              <div className="muted">
                {c.tower && `Tòa ${c.tower} · `}
                {c.floor != null && c.floor !== '' && `Tầng ${c.floor} · `}
                {c.area ? `${c.area}m² · ` : ''}
                {c.bedrooms != null && c.bedrooms !== '' && `${c.bedrooms} PN · `}
                {c.direction ? `Hướng ${c.direction}` : ''}
              </div>
              <div style={{ fontWeight: 800, color: '#1B2A4A', marginTop: 4, fontSize: 17 }}>{fmtMoney(c.price)}</div>
            </div>
            <PropertyStatusBadge status={c.status} />
          </div>
          <div className="row" style={{ marginTop: 10, gap: 8 }}>
            <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => openEdit(c)}>✏️ Sửa</button>
            <button className="btn btn-outline" style={{ flex: 1, color: '#dc2626', borderColor: '#fecaca' }} onClick={() => deleteProduct(c)}>🗑️ Xóa</button>
          </div>
        </div>
      ))}

      {showForm && (
        <Modal title={editing ? `✏️ Sửa sản phẩm ${editing.code}` : '➕ Thêm sản phẩm mới'} onClose={() => setShowForm(false)}>
          <form onSubmit={saveProduct}>
            <div className="field">
              <label className="muted">Mã căn *</label>
              <input className="input" placeholder="VD: A-1201" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </div>
            <div className="row" style={{ gap: 8 }}>
              <div className="field" style={{ flex: 1 }}>
                <label className="muted">Loại</label>
                <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {PROPERTY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label className="muted">Trạng thái</label>
                <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {PROPERTY_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <div className="field" style={{ flex: 1 }}>
                <label className="muted">Diện tích (m²)</label>
                <input className="input" type="number" step="0.1" min="0" placeholder="VD: 68.5" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label className="muted">Số phòng ngủ</label>
                <input className="input" type="number" min="0" placeholder="VD: 2" value={form.bedrooms} onChange={(e) => setForm({ ...form, bedrooms: e.target.value })} />
              </div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <div className="field" style={{ flex: 1 }}>
                <label className="muted">Hướng</label>
                <input className="input" placeholder="VD: Đông Nam" value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })} />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label className="muted">Tầng</label>
                <input className="input" type="number" min="0" placeholder="VD: 12" value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label className="muted">Giá bán (VNĐ) *</label>
              <input className="input" type="number" min="0" placeholder="VD: 3200000000" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowForm(false)}>Hủy</button>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={saving}>{saving ? 'Đang lưu...' : '💾 Lưu'}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
