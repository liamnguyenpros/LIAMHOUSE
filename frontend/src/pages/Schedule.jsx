import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtDateTime } from '../api.js';
import { Loading, ErrorBox, Empty } from '../components/ui.jsx';

const FILTERS = [
  { key: 'today', label: 'Hôm nay' },
  { key: 'overdue', label: 'Quá hạn' },
  { key: 'upcoming', label: 'Sắp tới' },
];

export default function Schedule() {
  const [filter, setFilter] = useState('today');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      setItems(await api(`/follow-ups?filter=${filter}`));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [filter]);

  async function complete(id) {
    await api(`/follow-ups/${id}/complete`, { method: 'POST' });
    load();
  }

  return (
    <>
      <div className="header"><h1>📅 Lịch chăm sóc</h1></div>
      <div className="chips">
        {FILTERS.map((f) => (
          <button key={f.key} className={`chip ${filter === f.key ? 'active' : ''}`} onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      {error && <ErrorBox message={error} onRetry={load} />}
      {loading && <Loading />}
      {!loading && !error && items.length === 0 && <Empty icon="🎉" text="Không có lịch nào trong nhóm này" />}

      {!loading && items.map((f) => (
        <div className="card" key={f.id} style={filter === 'overdue' ? { borderLeft: '4px solid #e05252' } : undefined}>
          <div className="row between">
            <div className="grow">
              <div style={{ fontWeight: 700 }}>{f.title}</div>
              <div className="muted">👤 {f.lead_name} · 📱 {f.lead_phone}</div>
              <div className="muted">⏰ {fmtDateTime(f.due_at)}{f.note ? ` · ${f.note}` : ''}</div>
            </div>
            <button className="btn btn-navy" style={{ width: 'auto', minWidth: 48 }} onClick={() => complete(f.id)}>✓</button>
          </div>
          <div className="row mt">
            <Link to={`/leads/${f.lead_id}`} className="btn btn-outline" style={{ width: 'auto', flex: 1 }}>Xem lead</Link>
            <a className="btn btn-navy" style={{ width: 'auto', flex: 1 }} href={`tel:${f.lead_phone}`}>📞 Gọi</a>
          </div>
        </div>
      ))}
    </>
  );
}
