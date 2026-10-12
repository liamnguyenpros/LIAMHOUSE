import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, fmtDateTime } from '../api.js';
import { Loading, ErrorBox, Empty } from '../components/ui.jsx';

export default function Notifications() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      setItems(await api('/notifications'));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function markRead(id) {
    await api(`/notifications/${id}/read`, { method: 'POST' });
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: 1 } : n)));
  }

  const unread = items.filter((n) => !n.is_read).length;

  return (
    <>
      <div className="header">
        <button className="back" onClick={() => navigate(-1)}>← Quay lại</button>
        <h1 style={{ marginTop: 4 }}>🔔 Thông báo</h1>
        {unread > 0 && <div className="sub">{unread} chưa đọc</div>}
      </div>

      {error && <ErrorBox message={error} onRetry={load} />}
      {loading && <Loading />}
      {!loading && !error && items.length === 0 && <Empty icon="🔔" text="Chưa có thông báo nào" />}

      {!loading && items.map((n) => (
        <div className="card tappable" key={n.id} onClick={() => !n.is_read && markRead(n.id)}
          style={!n.is_read ? { borderLeft: '4px solid #F5A623' } : undefined}>
          <div style={{ fontWeight: n.is_read ? 500 : 800 }}>{!n.is_read && '● '}{n.title}</div>
          {n.body && <div className="muted mt">{n.body}</div>}
          <div className="muted mt">{fmtDateTime(n.created_at)}</div>
        </div>
      ))}
    </>
  );
}
