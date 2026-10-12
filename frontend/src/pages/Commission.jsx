import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, fmtMoney } from '../api.js';
import { Loading, ErrorBox, Empty } from '../components/ui.jsx';

const STATUS_META = {
  cho_duyet: { label: 'Chờ duyệt', badge: 'badge-amber' },
  da_duyet: { label: 'Đã duyệt', badge: 'badge-green' },
  da_chi: { label: 'Đã chi', badge: 'badge-gray' },
};

const TYPE_META = {
  ca_nhan: { label: 'Cá nhân', badge: 'badge-score-hi' },
  doi_nhom: { label: 'Đội nhóm', badge: 'badge-stage' },
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || { label: status, badge: 'badge-gray' };
  return <span className={`badge ${meta.badge}`}>{meta.label}</span>;
}

function TypeBadge({ type }) {
  const meta = TYPE_META[type] || { label: type, badge: 'badge-gray' };
  return <span className={`badge ${meta.badge}`}>{meta.label}</span>;
}

export default function Commission() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadSummary() {
    try {
      const r = await api('/commissions/summary');
      setSummary(r);
    } catch {
      /* giữ null, không block trang */
    }
  }

  async function load() {
    setLoading(true);
    setError('');
    try {
      const r = await api(filter ? `/commissions?status=${filter}` : '/commissions');
      setRows(Array.isArray(r) ? r : (r.data || []));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadSummary(); }, []);
  useEffect(() => { load(); }, [filter]);

  async function markPaid(c) {
    if (!window.confirm(`Xác nhận đã chi ${fmtMoney(c.amount)} cho khách ${c.customer_name}?`)) return;
    try {
      await api(`/commissions/${c.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'da_chi' }) });
      load();
      loadSummary();
    } catch (e) {
      alert(e.message);
    }
  }

  const TABS = [
    { key: '', label: 'Tất cả' },
    { key: 'cho_duyet', label: 'Chờ duyệt' },
    { key: 'da_duyet', label: 'Đã duyệt' },
    { key: 'da_chi', label: 'Đã chi' },
  ];

  return (
    <>
      <div className="header">
        <button className="back" onClick={() => navigate(-1)}>← Quay lại</button>
        <h1 style={{ marginTop: 4 }}>💰 Hoa hồng</h1>
        <div className="sub">Theo dõi hoa hồng theo từng giao dịch</div>
      </div>

      {summary && (
        <div className="card">
          <div className="kpi-grid" style={{ margin: 0 }}>
            <div className="kpi">
              <div className="num" style={{ color: '#9a6206' }}>{fmtMoney(summary.cho_duyet?.total || 0)}</div>
              <div className="lbl">⏳ Chờ duyệt ({summary.cho_duyet?.count || 0})</div>
            </div>
            <div className="kpi">
              <div className="num" style={{ color: '#1d9e6c' }}>{fmtMoney(summary.da_duyet?.total || 0)}</div>
              <div className="lbl">✅ Đã duyệt ({summary.da_duyet?.count || 0})</div>
            </div>
            <div className="kpi">
              <div className="num" style={{ color: '#8a8f98' }}>{fmtMoney(summary.da_chi?.total || 0)}</div>
              <div className="lbl">💸 Đã chi ({summary.da_chi?.count || 0})</div>
            </div>
          </div>
        </div>
      )}

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`tab ${filter === t.key ? 'active' : ''}`} onClick={() => setFilter(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {error && <ErrorBox message={error} onRetry={load} />}
      {loading && <Loading />}

      {!loading && !error && rows.length === 0 && (
        <Empty icon="💰" text="Chưa có hoa hồng nào" />
      )}

      {!loading && !error && rows.map((c) => (
        <div className="card" key={c.id}>
          <div className="row between">
            <div className="grow">
              <div style={{ fontWeight: 700 }}>👤 {c.customer_name || '—'}</div>
              <div className="muted">🏠 {c.property_code || '—'}</div>
              <div className="mt" style={{ fontWeight: 800, fontSize: 18, color: '#1B2A4A' }}>
                {fmtMoney(c.amount)}
              </div>
              <div className="mt row" style={{ gap: 6 }}>
                <StatusBadge status={c.status} />
                <TypeBadge type={c.type} />
              </div>
            </div>
          </div>
          {c.status === 'cho_duyet' && (
            <div className="field mt">
              <button className="btn btn-navy" onClick={() => markPaid(c)}>
                💸 Đánh dấu đã chi
              </button>
            </div>
          )}
        </div>
      ))}
    </>
  );
}
