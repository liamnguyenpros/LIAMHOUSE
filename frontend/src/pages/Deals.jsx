import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, fmtMoney, fmtDateTime, downloadFile } from '../api.js';
import { Loading, ErrorBox, Empty, DealStatusBadge } from '../components/ui.jsx';

// mode="create" -> hiển thị form tạo deal (route /giao-dich/them)
export default function Deals({ mode }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // form tạo deal
  const [leads, setLeads] = useState([]);
  const [projects, setProjects] = useState([]);
  const [fLead, setFLead] = useState(searchParams.get('lead') || '');
  const [fProject, setFProject] = useState('');
  const [fProp, setFProp] = useState(searchParams.get('property') || '');
  const [fValue, setFValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [d, l, p] = await Promise.all([api('/deals'), api('/leads'), api('/projects')]);
      setDeals(d);
      setLeads(l);
      setProjects(p);
      // Pre-select property từ gợi ý khớp nhu cầu (?property=...)
      const preProp = searchParams.get('property');
      if (preProp && p.length > 0) {
        for (const pj of p) {
          const det = await api(`/projects/${pj.id}`);
          setProjects((prev) => prev.map((x) => (x.id === pj.id ? { ...x, _props: det.properties } : x)));
          const found = (det.properties || []).find((c) => c.id === preProp);
          if (found) {
            setFProject(pj.id);
            setFProp(preProp);
            setFValue(String(Math.round(found.price)));
            break;
          }
        }
      } else if (p.length > 0 && !fProject) {
        const det = await api(`/projects/${p[0].id}`);
        setProjects((prev) => prev.map((x) => (x.id === p[0].id ? { ...x, _props: det.properties } : x)));
        setFProject(p[0].id);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function onProjectChange(pid) {
    setFProject(pid);
    setFProp('');
    const det = await api(`/projects/${pid}`);
    setProjects((prev) => prev.map((x) => (x.id === pid ? { ...x, _props: det.properties } : x)));
  }

  const props = (projects.find((x) => x.id === fProject)?._props || []).filter((c) => c.status === 'dang_ban');

  async function exportDeals() {
    try {
      await downloadFile('/export/deals.xlsx', 'danh-sach-giao-dich.xlsx');
    } catch (e) {
      alert(e.message);
    }
  }

  async function submit(e) {
    e.preventDefault();
    if (!fLead || !fValue) {
      setFormError('Vui lòng chọn khách hàng và nhập giá trị');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const deal = await api('/deals', {
        method: 'POST',
        body: JSON.stringify({ lead_id: fLead, property_id: fProp || null, value: Number(fValue) }),
      });
      navigate(`/giao-dich/${deal.id}`);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (mode === 'create') {
    return (
      <>
        <div className="header">
          <button className="back" onClick={() => navigate(-1)}>← Quay lại</button>
          <h1 style={{ marginTop: 4 }}>➕ Tạo giao dịch</h1>
        </div>
        {loading && <Loading />}
        {!loading && (
          <form onSubmit={submit}>
            <div className="field">
              <label>Khách hàng *</label>
              <select className="select" value={fLead} onChange={(e) => setFLead(e.target.value)}>
                <option value="">— Chọn lead —</option>
                {leads.filter((l) => l.status !== 'mat').map((l) => (
                  <option key={l.id} value={l.id}>{l.full_name} · {l.phone}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Dự án</label>
              <select className="select" value={fProject} onChange={(e) => onProjectChange(e.target.value)}>
                {projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
              </select>
            </div>
            <div className="field">
              <label>Căn hộ (không bắt buộc)</label>
              <select className="select" value={fProp} onChange={(e) => { setFProp(e.target.value); const c = props.find((x) => x.id === e.target.value); if (c) setFValue(String(Math.round(c.price))); }}>
                <option value="">— Không gắn căn —</option>
                {props.map((c) => (
                  <option key={c.id} value={c.id}>Căn {c.code} · {fmtMoney(c.price)}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Giá trị giao dịch (VNĐ) *</label>
              <input className="input" inputMode="numeric" value={fValue} onChange={(e) => setFValue(e.target.value.replace(/[^\d]/g, ''))} placeholder="VD: 3200000000" />
              {fValue && <div className="muted mt">= {fmtMoney(Number(fValue))}</div>}
            </div>
            {formError && <div className="error-box" style={{ margin: '0 16px' }}>{formError}</div>}
            <div className="field" style={{ marginTop: 16 }}>
              <button className="btn btn-primary" disabled={saving}>{saving ? 'Đang tạo...' : '💾 Tạo giao dịch'}</button>
            </div>
          </form>
        )}
      </>
    );
  }

  return (
    <>
      <div className="header"><h1>🤝 Giao dịch</h1><div className="sub">{deals.length} giao dịch</div></div>
      <div className="row" style={{ padding: '0 16px' }}>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => navigate('/giao-dich/them')}>➕ Tạo giao dịch</button>
        <button className="btn btn-outline" style={{ width: 'auto', padding: '10px 16px' }} onClick={exportDeals}>📥 Excel</button>
      </div>
      {error && <ErrorBox message={error} onRetry={load} />}
      {loading && <Loading />}
      {!loading && !error && deals.length === 0 && <Empty icon="🤝" text="Chưa có giao dịch nào" />}
      {!loading && deals.map((d) => (
        <Link key={d.id} to={`/giao-dich/${d.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="card tappable">
            <div className="row between">
              <div className="grow">
                <div style={{ fontWeight: 700 }}>{d.lead_name}</div>
                <div className="muted">{d.property_code ? `Căn ${d.property_code}` : 'Chưa gắn căn'} · {fmtDateTime(d.created_at)}</div>
                <div style={{ fontWeight: 800, color: '#1B2A4A', marginTop: 4 }}>{fmtMoney(d.value)}</div>
              </div>
              <DealStatusBadge status={d.status} />
            </div>
          </div>
        </Link>
      ))}
    </>
  );
}
