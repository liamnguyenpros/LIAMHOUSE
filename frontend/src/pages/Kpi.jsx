import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Loading, ErrorBox, Empty } from '../components/ui.jsx';

function barColor(pct) {
  if (pct >= 100) return '#1d9e6c';
  if (pct >= 60) return '#F5A623';
  return '#e05252';
}

export default function Kpi() {
  const [period, setPeriod] = useState('tuan');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // form đặt chỉ tiêu
  const [editing, setEditing] = useState(false);
  const [targets, setTargets] = useState({});
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await api(`/kpis/summary?period=${period}`);
      setItems(data.items || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [period]);

  function startEdit() {
    const t = {};
    items.forEach((i) => { t[i.metric] = i.target; });
    setTargets(t);
    setEditing(true);
  }

  async function saveTargets(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api('/kpis/targets', {
        method: 'PUT',
        body: JSON.stringify({
          targets: items.map((i) => ({ metric: i.metric, period, target_value: Number(targets[i.metric]) || 0 })),
        }),
      });
      setEditing(false);
      load();
    } catch (e2) {
      alert(e2.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="header">
        <h1>📊 KPI cá nhân</h1>
        <div className="sub">Theo dõi tiến độ chỉ tiêu của bạn</div>
      </div>

      <div className="tabs">
        <button className={`tab ${period === 'tuan' ? 'active' : ''}`} onClick={() => setPeriod('tuan')}>Tuần này</button>
        <button className={`tab ${period === 'thang' ? 'active' : ''}`} onClick={() => setPeriod('thang')}>Tháng này</button>
      </div>

      {error && <ErrorBox message={error} onRetry={load} />}
      {loading && <Loading />}

      {!loading && !error && items.length === 0 && <Empty icon="📊" text="Chưa có chỉ tiêu nào" />}

      {!loading && !error && !editing && items.map((i) => {
        const pct = Math.min(100, Number(i.percent) || 0);
        return (
          <div className="card" key={i.metric}>
            <div className="row between">
              <div style={{ fontWeight: 700 }}>{i.label}</div>
              <div style={{ fontWeight: 800, color: barColor(i.percent) }}>{i.percent}%</div>
            </div>
            <div className="progress mt">
              <div style={{ width: `${pct}%`, background: barColor(i.percent) }} />
            </div>
            <div className="muted mt">Đã đạt {i.actual} / mục tiêu {i.target}</div>
          </div>
        );
      })}

      {!loading && !error && editing && (
        <form onSubmit={saveTargets}>
          <div className="section-title">✏️ Đặt chỉ tiêu {period === 'tuan' ? 'tuần' : 'tháng'}</div>
          {items.map((i) => (
            <div className="field" key={i.metric}>
              <label>{i.label}</label>
              <input className="input" inputMode="numeric" value={targets[i.metric] ?? ''} onChange={(e) => setTargets({ ...targets, [i.metric]: e.target.value.replace(/[^\d]/g, '') })} />
            </div>
          ))}
          <div className="field">
            <button className="btn btn-primary" disabled={saving}>{saving ? 'Đang lưu...' : '💾 Lưu chỉ tiêu'}</button>
          </div>
          <div className="field">
            <button type="button" className="btn btn-outline" onClick={() => setEditing(false)}>Hủy</button>
          </div>
        </form>
      )}

      {!loading && !error && !editing && items.length > 0 && (
        <div className="field" style={{ marginTop: 8 }}>
          <button className="btn btn-outline" onClick={startEdit}>✏️ Đặt chỉ tiêu</button>
        </div>
      )}
    </>
  );
}
