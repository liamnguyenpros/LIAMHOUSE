import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, fmtMoney, fmtDateTime, DOC_TYPE_LABELS } from '../api.js';
import { Loading, ErrorBox, Empty, PropertyStatusBadge } from '../components/ui.jsx';

const DOC_TABS = ['phap_ly', 'mat_bang', 'tien_do'];

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

  useEffect(() => { load(); }, [id]);
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

      <div className="section-title">🏠 Giỏ hàng ({project.properties.length} căn)</div>
      {project.properties.map((c) => (
        <div className="card" key={c.id}>
          <div className="row between">
            <div className="grow">
              <div style={{ fontWeight: 800, fontSize: 17 }}>Căn {c.code}</div>
              <div className="muted">Tòa {c.tower} · Tầng {c.floor} · {c.area}m² · {c.bedrooms} PN</div>
              <div style={{ fontWeight: 800, color: '#1B2A4A', marginTop: 4, fontSize: 17 }}>{fmtMoney(c.price)}</div>
            </div>
            <PropertyStatusBadge status={c.status} />
          </div>
        </div>
      ))}
    </>
  );
}
