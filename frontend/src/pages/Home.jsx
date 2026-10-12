import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, getUser, fmtMoney, fmtDateTime } from '../api.js';
import { Loading, ErrorBox, Empty } from '../components/ui.jsx';

export default function Home() {
  const [data, setData] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [error, setError] = useState('');
  const user = getUser();
  const navigate = useNavigate();

  async function load() {
    setError('');
    try {
      const [dash, notifs] = await Promise.all([
        api('/dashboard/summary'),
        api('/notifications').catch(() => []),
      ]);
      setData(dash);
      setNotifications(Array.isArray(notifs) ? notifs : (notifs.data || []));
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => { load(); }, []);

  async function complete(id) {
    await api(`/follow-ups/${id}/complete`, { method: 'POST' });
    load();
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const recentNotifs = notifications.slice(0, 5);

  return (
    <>
      <div className="header">
        <div className="row between" style={{ alignItems: 'center' }}>
          <div>
            <h1>Xin chào, {user?.full_name || 'bạn'} 👋</h1>
            <div className="sub">Hôm nay bạn có {data?.followup_den_han ?? '…'} lịch chăm sóc</div>
          </div>
          <button
            onClick={() => navigate('/thong-bao')}
            style={{
              position: 'relative', background: '#fff', border: '1px solid #e5e7eb',
              borderRadius: 12, width: 44, height: 44, fontSize: 20, cursor: 'pointer',
            }}
            title="Thông báo"
          >
            🔔
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute', top: -6, right: -6, background: '#ef4444', color: '#fff',
                borderRadius: 10, minWidth: 20, height: 20, fontSize: 12, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px',
              }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        </div>
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

          <div className="row between" style={{ alignItems: 'center', marginTop: 8 }}>
            <div className="section-title" style={{ margin: 0 }}>🔔 Thông báo mới</div>
            <button className="btn btn-outline" style={{ width: 'auto', padding: '6px 12px', fontSize: 13 }} onClick={() => navigate('/thong-bao')}>
              Xem tất cả {unreadCount > 0 && `(${unreadCount})`}
            </button>
          </div>
          {recentNotifs.length === 0 && <Empty icon="🔕" text="Chưa có thông báo nào" />}
          {recentNotifs.map((n) => (
            <div
              className="card tappable"
              key={n.id}
              onClick={() => navigate('/thong-bao')}
              style={!n.is_read ? { borderLeft: '4px solid #f4a522' } : {}}
            >
              <div style={{ fontWeight: n.is_read ? 500 : 700 }}>{n.title || 'Thông báo'}</div>
              {n.body && <div className="muted" style={{ marginTop: 4 }}>{n.body}</div>}
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>⏰ {fmtDateTime(n.created_at)}</div>
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
