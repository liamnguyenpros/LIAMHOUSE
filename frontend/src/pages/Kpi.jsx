import { useEffect, useState } from 'react';
import { api, fmtDate } from '../api.js';
import { Loading, ErrorBox, Empty } from '../components/ui.jsx';

function barColor(pct) {
  if (pct >= 100) return '#1d9e6c';
  if (pct >= 60) return '#F5A623';
  return '#e05252';
}

const METRIC_LABELS = {
  calls: 'Cuộc gọi',
  leads_new: 'Lead mới',
  viewings: 'Lịch xem',
  holds: 'Giữ chỗ',
  deposits: 'Đặt cọc',
  deals_closed: 'Chốt deal',
  revenue: 'Doanh số',
};

const PERIOD_LABELS = { tuan: 'Tuần', thang: 'Tháng', quy: 'Quý' };

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

const EMPTY_CFG = { metric: 'calls', target_value: '', period_type: 'thang', warning_threshold: '60', is_active: true };

export default function Kpi() {
  const [tab, setTab] = useState('tongquan'); // tongquan | chitieu | lichsu
  const [period, setPeriod] = useState('tuan');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // form đặt chỉ tiêu (tab tổng quan)
  const [editing, setEditing] = useState(false);
  const [targets, setTargets] = useState({});
  const [saving, setSaving] = useState(false);

  // tab chỉ tiêu
  const [configs, setConfigs] = useState([]);
  const [cfgLoading, setCfgLoading] = useState(false);
  const [showCfgForm, setShowCfgForm] = useState(false);
  const [cfgEditing, setCfgEditing] = useState(null);
  const [cfgForm, setCfgForm] = useState(EMPTY_CFG);
  const [cfgSaving, setCfgSaving] = useState(false);

  // tab lịch sử
  const [histMetric, setHistMetric] = useState('calls');
  const [histPeriod, setHistPeriod] = useState('thang');
  const [history, setHistory] = useState([]);
  const [histLoading, setHistLoading] = useState(false);
  const [snapshotting, setSnapshotting] = useState(false);

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
  useEffect(() => { if (tab === 'tongquan') load(); }, [period, tab]);

  async function loadConfigs() {
    setCfgLoading(true);
    try {
      const r = await api('/kpis/configs');
      setConfigs(Array.isArray(r) ? r : (r.data || []));
    } catch (e) {
      setError(e.message);
    } finally {
      setCfgLoading(false);
    }
  }
  useEffect(() => { if (tab === 'chitieu') loadConfigs(); }, [tab]);

  async function loadHistory() {
    setHistLoading(true);
    try {
      const r = await api(`/kpis/history?metric=${histMetric}&period_type=${histPeriod}`);
      setHistory(Array.isArray(r) ? r : (r.data || []));
    } catch (e) {
      setError(e.message);
    } finally {
      setHistLoading(false);
    }
  }
  useEffect(() => { if (tab === 'lichsu') loadHistory(); }, [tab, histMetric, histPeriod]);

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

  function openCfgAdd() {
    setCfgEditing(null);
    setCfgForm(EMPTY_CFG);
    setShowCfgForm(true);
  }

  function openCfgEdit(c) {
    setCfgEditing(c);
    setCfgForm({
      metric: c.metric || 'calls',
      target_value: c.target_value ?? '',
      period_type: c.period_type || 'thang',
      warning_threshold: c.warning_threshold ?? '60',
      is_active: c.is_active !== false,
    });
    setShowCfgForm(true);
  }

  async function saveCfg(e) {
    e.preventDefault();
    if (cfgForm.target_value === '' || Number(cfgForm.target_value) < 0) { alert('Nhập chỉ tiêu hợp lệ'); return; }
    setCfgSaving(true);
    try {
      const body = {
        metric: cfgForm.metric,
        target_value: Number(cfgForm.target_value),
        period_type: cfgForm.period_type,
        warning_threshold: cfgForm.warning_threshold === '' ? null : Number(cfgForm.warning_threshold),
        is_active: cfgForm.is_active,
      };
      if (cfgEditing) {
        await api(`/kpis/configs/${cfgEditing.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        await api('/kpis/configs', { method: 'POST', body: JSON.stringify(body) });
      }
      setShowCfgForm(false);
      loadConfigs();
    } catch (err) {
      alert(err.message);
    } finally {
      setCfgSaving(false);
    }
  }

  async function toggleCfg(c) {
    try {
      await api(`/kpis/configs/${c.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: !c.is_active }) });
      loadConfigs();
    } catch (e) {
      alert(e.message);
    }
  }

  async function takeSnapshot() {
    if (!window.confirm('Chụp snapshot số liệu KPI hiện tại?')) return;
    setSnapshotting(true);
    try {
      await api('/kpis/snapshot', { method: 'POST', body: JSON.stringify({}) });
      alert('Đã chụp snapshot!');
      if (tab === 'lichsu') loadHistory();
    } catch (e) {
      alert(e.message);
    } finally {
      setSnapshotting(false);
    }
  }

  const TABS = [
    { key: 'tongquan', label: 'Tổng quan' },
    { key: 'chitieu', label: 'Chỉ tiêu' },
    { key: 'lichsu', label: 'Lịch sử' },
  ];

  return (
    <>
      <div className="header">
        <h1>📊 KPI cá nhân</h1>
        <div className="sub">Theo dõi tiến độ chỉ tiêu của bạn</div>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {error && <ErrorBox message={error} onRetry={() => { setError(''); if (tab === 'tongquan') load(); else if (tab === 'chitieu') loadConfigs(); else loadHistory(); }} />}

      {/* ===== TAB TỔNG QUAN ===== */}
      {tab === 'tongquan' && (
        <>
          <div className="tabs" style={{ marginTop: 4 }}>
            <button className={`tab ${period === 'tuan' ? 'active' : ''}`} onClick={() => setPeriod('tuan')}>Tuần này</button>
            <button className={`tab ${period === 'thang' ? 'active' : ''}`} onClick={() => setPeriod('thang')}>Tháng này</button>
          </div>

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

          <div className="field" style={{ marginTop: 8 }}>
            <button className="btn btn-outline" onClick={takeSnapshot} disabled={snapshotting}>
              {snapshotting ? 'Đang chụp...' : '📸 Chụp snapshot hiện tại'}
            </button>
          </div>
        </>
      )}

      {/* ===== TAB CHỈ TIÊU ===== */}
      {tab === 'chitieu' && (
        <>
          <div className="field">
            <button className="btn btn-primary" onClick={openCfgAdd}>➕ Thêm chỉ tiêu</button>
          </div>
          {cfgLoading && <Loading />}
          {!cfgLoading && configs.length === 0 && <Empty icon="🎯" text="Chưa có cấu hình chỉ tiêu" />}
          {!cfgLoading && configs.map((c) => (
            <div className="card" key={c.id} style={{ opacity: c.is_active === false ? 0.6 : 1 }}>
              <div className="row between">
                <div style={{ fontWeight: 700 }}>{METRIC_LABELS[c.metric] || c.metric}</div>
                <span className={`badge ${c.is_active === false ? 'badge-gray' : 'badge-green'}`}>
                  {c.is_active === false ? 'Tắt' : 'Đang dùng'}
                </span>
              </div>
              <div className="row mt" style={{ gap: 8, flexWrap: 'wrap' }}>
                <span className="chip" style={{ fontWeight: 800 }}>🎯 {c.target_value}</span>
                <span className="chip">{PERIOD_LABELS[c.period_type] || c.period_type}</span>
                {c.warning_threshold != null && <span className="chip">⚠️ Cảnh báo &lt; {c.warning_threshold}%</span>}
              </div>
              <div className="row mt" style={{ gap: 8 }}>
                <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => openCfgEdit(c)}>✏️ Sửa</button>
                <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => toggleCfg(c)}>
                  {c.is_active === false ? '▶️ Bật' : '⏸️ Tắt'}
                </button>
              </div>
            </div>
          ))}

          {showCfgForm && (
            <Modal title={cfgEditing ? '✏️ Sửa chỉ tiêu' : '➕ Thêm chỉ tiêu'} onClose={() => setShowCfgForm(false)}>
              <form onSubmit={saveCfg}>
                <div className="field">
                  <label>Chỉ số</label>
                  <select className="input" value={cfgForm.metric} onChange={(e) => setCfgForm({ ...cfgForm, metric: e.target.value })}>
                    {Object.entries(METRIC_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Mục tiêu *</label>
                  <input className="input" inputMode="numeric" value={cfgForm.target_value} onChange={(e) => setCfgForm({ ...cfgForm, target_value: e.target.value.replace(/[^\d]/g, '') })} placeholder="VD: 50" />
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <div className="field grow">
                    <label>Kỳ</label>
                    <select className="input" value={cfgForm.period_type} onChange={(e) => setCfgForm({ ...cfgForm, period_type: e.target.value })}>
                      <option value="tuan">Tuần</option>
                      <option value="thang">Tháng</option>
                      <option value="quy">Quý</option>
                    </select>
                  </div>
                  <div className="field grow">
                    <label>Ngưỡng cảnh báo (%)</label>
                    <input className="input" inputMode="numeric" value={cfgForm.warning_threshold} onChange={(e) => setCfgForm({ ...cfgForm, warning_threshold: e.target.value.replace(/[^\d]/g, '') })} placeholder="60" />
                  </div>
                </div>
                <div className="field">
                  <button className="btn btn-primary" disabled={cfgSaving}>{cfgSaving ? 'Đang lưu...' : '💾 Lưu'}</button>
                </div>
                <div className="field">
                  <button type="button" className="btn btn-outline" onClick={() => setShowCfgForm(false)}>Hủy</button>
                </div>
              </form>
            </Modal>
          )}
        </>
      )}

      {/* ===== TAB LỊCH SỬ ===== */}
      {tab === 'lichsu' && (
        <>
          <div className="row" style={{ gap: 8 }}>
            <div className="field grow">
              <label>Chỉ số</label>
              <select className="input" value={histMetric} onChange={(e) => setHistMetric(e.target.value)}>
                {Object.entries(METRIC_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="field grow">
              <label>Kỳ</label>
              <select className="input" value={histPeriod} onChange={(e) => setHistPeriod(e.target.value)}>
                <option value="tuan">Tuần</option>
                <option value="thang">Tháng</option>
                <option value="quy">Quý</option>
              </select>
            </div>
          </div>
          <div className="field">
            <button className="btn btn-outline" onClick={takeSnapshot} disabled={snapshotting}>
              {snapshotting ? 'Đang chụp...' : '📸 Chụp snapshot hiện tại'}
            </button>
          </div>
          {histLoading && <Loading />}
          {!histLoading && history.length === 0 && <Empty icon="📸" text="Chưa có snapshot nào" />}
          {!histLoading && history.map((h, idx) => {
            const pct = h.target_value > 0 ? Math.round((Number(h.actual_value) / Number(h.target_value)) * 100) : 0;
            return (
              <div className="card" key={h.id || idx}>
                <div className="row between">
                  <div style={{ fontWeight: 700 }}>{fmtDate(h.snapshot_at || h.created_at)}</div>
                  <div style={{ fontWeight: 800, color: barColor(pct) }}>{pct}%</div>
                </div>
                <div className="progress mt">
                  <div style={{ width: `${Math.min(100, pct)}%`, background: barColor(pct) }} />
                </div>
                <div className="muted mt">Thực tế {h.actual_value} / mục tiêu {h.target_value}</div>
              </div>
            );
          })}
        </>
      )}
    </>
  );
}
