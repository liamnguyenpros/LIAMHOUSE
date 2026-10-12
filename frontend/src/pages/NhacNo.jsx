import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, fmtMoney, fmtDate } from '../api.js';
import { Loading, ErrorBox, Empty } from '../components/ui.jsx';

export default function NhacNo() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const r = await api('/payment-schedules/overdue');
      setRows(Array.isArray(r) ? r : (r.data || []));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const totalNo = rows.reduce((s, r) => s + Number(r.con_no ?? (Number(r.amount || 0) - Number(r.paid_amount || 0))), 0);

  return (
    <>
      <div className="header">
        <button className="back" onClick={() => navigate(-1)}>← Quay lại</button>
        <h1 style={{ marginTop: 4 }}>⚠️ Nhắc nợ</h1>
        <div className="sub">{rows.length} đợt quá hạn</div>
      </div>

      {error && <ErrorBox message={error} onRetry={load} />}
      {loading && <Loading />}

      {!loading && !error && rows.length > 0 && (
        <div className="card">
          <div className="row between">
            <div style={{ fontWeight: 700 }}>Tổng công nợ quá hạn</div>
            <div style={{ fontWeight: 800, fontSize: 20, color: '#e05252' }}>{fmtMoney(totalNo)}</div>
          </div>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <Empty icon="🎉" text="Không có đợt thanh toán nào quá hạn. Tuyệt vời!" />
      )}

      {!loading && rows.map((r) => {
        const conNo = Number(r.con_no ?? (Number(r.amount || 0) - Number(r.paid_amount || 0)));
        const days = r.so_ngay_qua_han ?? r.days_overdue ?? null;
        return (
          <div className="card" key={r.id}>
            <div className="row between">
              <div className="grow">
                <div style={{ fontWeight: 700 }}>👤 {r.lead_name || '—'}</div>
                <div className="muted">📱 {r.lead_phone || '—'}</div>
                <div className="mt">Đợt {r.dot_number}{r.label ? ` — ${r.label}` : ''} · Đến hạn: {r.due_date ? fmtDate(r.due_date) : '—'}</div>
                <div>Còn nợ: <b style={{ color: '#e05252' }}>{fmtMoney(conNo)}</b>
                  {days != null && days > 0 && <span className="badge badge-mat" style={{ marginLeft: 8 }}>Quá hạn {days} ngày</span>}
                </div>
              </div>
            </div>
            <div className="row mt">
              {r.lead_phone && (
                <a className="btn btn-navy btn-sm" style={{ flex: 1, textDecoration: 'none', textAlign: 'center' }} href={`tel:${r.lead_phone}`}>📞 Gọi nhắc nợ</a>
              )}
              {r.deal_id && (
                <Link className="btn btn-outline btn-sm" style={{ flex: 1, textDecoration: 'none', textAlign: 'center' }} to={`/giao-dich/${r.deal_id}`}>Xem deal</Link>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}
