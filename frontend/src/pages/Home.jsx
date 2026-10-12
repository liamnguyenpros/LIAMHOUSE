import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, getUser, fmtMoney, fmtDateTime } from '../api.js';
import { Loading, ErrorBox, Empty } from '../components/ui.jsx';

export default function Home() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const user = getUser();
  const navigate = useNavigate();

  async function load() {
    setError('');
    try {
      setData(await api('/dashboard/summary'));
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => { load(); }, []);

  async function complete(id) {
    await api(`/follow-ups/${id}/complete`, { method: 'POST' });
    load();
  }

  return (
    <>
      <div className="header">
        <h1>Xin chào, {user?.full_name || 'bạn'} 👋</h1>
        <div className="sub">Hôm nay bạn có {data?.followup_den_han ?? '…'} lịch chăm sóc</div>
      </div>

      {error && <ErrorBox message={error} onRetry={load} />}
      {!data && !error && <Loading />}

      {data && (
        <>
          <div className="kpi-grid">
            <div className="kpi"><div className="num">{data.leads_moi_hom_nay}</div><div className="lbl">Lead mới hôm nay</div></div>
            <div className="kpi"><div className="num">{data.followup_den_han}</div><div className="lbl">Follow-up đến hạn</div></div>
            <div className="kpi"><div className={`num ${data.followup_qua_han > 0 ? 'danger' : ''}`}>{data.followup_qua_han}</div><div className="lbl">Quá hạn ⚠️</div></div>
            <div className="kpi"><div className="num">{data.deals_thang}</div><div className="lbl">Deal tháng ({fmtMoney(data.doanh_so_thang)})</div></div>
          </div>

          <div className="section-title">📅 Lịch chăm sóc hôm nay</div>
          {data.followup_hom_nay.length === 0 && <Empty icon="🎉" text="Hôm nay không còn lịch nào. Tuyệt vời!" />}
          {data.followup_hom_nay.map((f) => (
            <div className="card" key={f.id}>
              <div className="row between">
                <div className="grow">
                  <div style={{ fontWeight: 700 }}>{f.title}</div>
                  <div className="muted">👤 {f.lead_name} · ⏰ {fmtDateTime(f.due_at)}</div>
                </div>
                <button className="btn btn-navy" style={{ width: 'auto', minWidth: 48 }} onClick={() => complete(f.id)}>✓</button>
              </div>
              <div className="row mt">
                <Link to={`/leads/${f.lead_id}`} className="btn btn-outline" style={{ width: 'auto', flex: 1 }}>Xem lead</Link>
              </div>
            </div>
          ))}
        </>
      )}

      <button className="ai-fab" onClick={() => navigate('/ai-chat')} title="Hỏi AI">
        🤖
      </button>
    </>
  );
}
