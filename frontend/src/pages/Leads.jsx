import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, STAGES, STAGE_LABELS, SOURCE_LABELS, downloadFile } from '../api.js';
import { Loading, ErrorBox, Empty, ScoreBadge, StageBadge } from '../components/ui.jsx';

export default function Leads() {
  const [leads, setLeads] = useState([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (q.trim()) params.set('q', q.trim());
      setLeads(await api('/leads?' + params.toString()));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [status]);
  useEffect(() => {
    const t = setTimeout(() => load(), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function exportExcel() {
    try {
      await downloadFile('/export/leads.xlsx', 'danh-sach-leads.xlsx');
    } catch (e) {
      alert(e.message);
    }
  }

  return (
    <>
      <div className="header"><h1>👥 Leads</h1><div className="sub">{leads.length} khách hàng</div></div>

      <div className="field">
        <input className="input" placeholder="🔍 Tìm tên hoặc số điện thoại..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="row" style={{ padding: '0 16px' }}>
        <div className="grow" />
        <button className="btn btn-outline" style={{ width: 'auto', padding: '10px 16px' }} onClick={exportExcel}>📥 Xuất Excel</button>
      </div>

      <div className="chips">
        <button className={`chip ${status === '' ? 'active' : ''}`} onClick={() => setStatus('')}>Tất cả</button>
        {STAGES.map((s) => (
          <button key={s} className={`chip ${status === s ? 'active' : ''}`} onClick={() => setStatus(s)}>{STAGE_LABELS[s]}</button>
        ))}
        <button className={`chip ${status === 'mat' ? 'active' : ''}`} onClick={() => setStatus('mat')}>Mất</button>
      </div>

      {error && <ErrorBox message={error} onRetry={load} />}
      {loading && <Loading />}
      {!loading && !error && leads.length === 0 && <Empty icon="👥" text="Chưa có lead nào ở nhóm này" />}

      {!loading && leads.map((l) => (
        <Link key={l.id} to={`/leads/${l.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="card tappable">
            <div className="row between">
              <div className="grow">
                <div style={{ fontWeight: 700 }}>{l.full_name}</div>
                <div className="muted">📱 {l.phone}{l.source ? ` · ${SOURCE_LABELS[l.source] || l.source}` : ''}</div>
              </div>
              <ScoreBadge score={l.score} />
            </div>
            <div className="row mt"><StageBadge status={l.status} /></div>
          </div>
        </Link>
      ))}
    </>
  );
}
