import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api, fmtMoney, fmtDateTime, fmtDate } from '../api.js';
import { Loading, ErrorBox, Empty, DealStatusBadge } from '../components/ui.jsx';

function ScheduleBadge({ s }) {
  const st = s.trang_thai_hien_tai || s.status || 'chua_den_han';
  const map = {
    da_thanh_toan: ['badge-green', '✅ Đã thanh toán'],
    qua_han: ['badge-mat', '🔴 Quá hạn'],
    sap_den_han: ['badge-amber', '🟡 Sắp đến hạn'],
    chua_den_han: ['badge-gray', 'Chưa đến hạn'],
  };
  const [cls, lbl] = map[st] || ['badge-gray', st];
  return <span className={`badge ${cls}`}>{lbl}</span>;
}

// Timeline trạng thái deal: Giữ chỗ → Đặt cọc → Ký HĐ → Bàn giao
const DEAL_STEPS = [
  { key: 'giu_cho', label: '🔒 Giữ chỗ' },
  { key: 'dat_coc', label: '💰 Đặt cọc' },
  { key: 'ky_hd', label: '📝 Ký HĐ' },
  { key: 'ban_giao', label: '🔑 Bàn giao' },
];

function DealStepper({ status }) {
  const idx = DEAL_STEPS.findIndex((s) => s.key === status);
  const activeIdx = idx >= 0 ? idx : 0;
  return (
    <div className="stepper">
      {DEAL_STEPS.map((s, i) => (
        <div key={s.key} className={`step ${i < activeIdx ? 'done' : ''} ${i === activeIdx ? 'current' : ''}`}>
          {i < activeIdx ? '✓ ' : ''}{s.label}
        </div>
      ))}
    </div>
  );
}

// Modal đơn giản dùng chung
function Modal({ title, onClose, children }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(23,39,68,0.55)', display: 'flex',
      alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onClose}>
      <div className="card" style={{ width: '100%', maxWidth: 480, margin: 0, borderRadius: '16px 16px 0 0' }} onClick={(e) => e.stopPropagation()}>
        <div className="section-title" style={{ marginBottom: 12 }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

export default function DealDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [deal, setDeal] = useState(null);
  const [error, setError] = useState('');
  const [closing, setClosing] = useState(false);
  const [tab, setTab] = useState('info');

  // lịch thanh toán
  const [scheds, setScheds] = useState([]);
  const [schedLoading, setSchedLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showGenForm, setShowGenForm] = useState(false);
  const [fLabel, setFLabel] = useState('');
  const [fDue, setFDue] = useState('');
  const [fAmount, setFAmount] = useState('');
  const [fNote, setFNote] = useState('');
  const [gSoDot, setGSoDot] = useState('3');
  const [gNgayBD, setGNgayBD] = useState('');
  const [gKhoangCach, setGKhoangCach] = useState('30');
  const [saving, setSaving] = useState(false);

  // hold queue
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [acting, setActing] = useState(false);

  async function load() {
    setError('');
    try {
      setDeal(await api(`/deals/${id}`));
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => { load(); }, [id]);

  async function loadScheds() {
    setSchedLoading(true);
    try {
      const r = await api(`/deals/${id}/payment-schedules`);
      setScheds(Array.isArray(r) ? r : (r.data || []));
    } catch (e) {
      alert(e.message);
    } finally {
      setSchedLoading(false);
    }
  }
  useEffect(() => { if (tab === 'thanhtoan') loadScheds(); }, [tab]);

  async function closeDeal() {
    if (!window.confirm(`Chốt giao dịch trị giá ${fmtMoney(deal.value)}?`)) return;
    setClosing(true);
    try {
      await api(`/deals/${id}/close`, { method: 'POST' });
      load();
    } catch (e) {
      alert(e.message);
    } finally {
      setClosing(false);
    }
  }

  async function cancelHold() {
    if (!cancelReason.trim()) return alert('Vui lòng nhập lý do hủy giữ chỗ');
    setActing(true);
    try {
      await api(`/deals/${id}/cancel-hold`, { method: 'POST', body: JSON.stringify({ cancel_reason: cancelReason.trim() }) });
      setShowCancelModal(false);
      setCancelReason('');
      load();
    } catch (e) {
      alert(e.message);
    } finally {
      setActing(false);
    }
  }

  async function toDeposit() {
    const amount = Number(String(depositAmount).replace(/[^\d]/g, ''));
    if (!amount || amount <= 0) return alert('Số tiền cọc không hợp lệ');
    setActing(true);
    try {
      await api(`/deals/${id}/to-deposit`, { method: 'POST', body: JSON.stringify({ deposit_amount: amount }) });
      setShowDepositModal(false);
      setDepositAmount('');
      load();
    } catch (e) {
      alert(e.message);
    } finally {
      setActing(false);
    }
  }

  async function paySchedule(s) {
    const conNo = Number(s.con_no ?? (Number(s.amount || 0) - Number(s.paid_amount || 0)));
    const raw = window.prompt(`Ghi nhận thanh toán đợt "${s.label || 'Đợt ' + s.dot_number}"\nCòn nợ: ${fmtMoney(conNo)}\nNhập số tiền:`, String(Math.round(conNo)));
    if (raw === null) return;
    const amount = Number(raw.replace(/[^\d]/g, ''));
    if (!amount || amount <= 0) return alert('Số tiền không hợp lệ');
    try {
      await api(`/payment-schedules/${s.id}/pay`, { method: 'PATCH', body: JSON.stringify({ amount }) });
      loadScheds();
    } catch (e) {
      alert(e.message);
    }
  }

  async function deleteSchedule(s) {
    if (!window.confirm(`Xóa đợt "${s.label || 'Đợt ' + s.dot_number}"?`)) return;
    try {
      await api(`/payment-schedules/${s.id}`, { method: 'DELETE' });
      loadScheds();
    } catch (e) {
      alert(e.message);
    }
  }

  async function addSchedule(e) {
    e.preventDefault();
    if (!fAmount) return alert('Vui lòng nhập số tiền');
    setSaving(true);
    try {
      await api(`/deals/${id}/payment-schedules`, {
        method: 'POST',
        body: JSON.stringify({
          label: fLabel.trim() || null,
          due_date: fDue ? fDue.replace('T', ' ').slice(0, 10) : null,
          amount: Number(fAmount.replace(/[^\d]/g, '')),
          note: fNote.trim() || null,
        }),
      });
      setFLabel(''); setFDue(''); setFAmount(''); setFNote('');
      setShowAddForm(false);
      loadScheds();
    } catch (e2) {
      alert(e2.message);
    } finally {
      setSaving(false);
    }
  }

  async function generateSchedules(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api(`/deals/${id}/payment-schedules/generate`, {
        method: 'POST',
        body: JSON.stringify({
          so_dot: Number(gSoDot) || 1,
          ngay_bat_dau: gNgayBD || null,
          khoang_cach_ngay: Number(gKhoangCach) || 30,
        }),
      });
      setShowGenForm(false);
      loadScheds();
    } catch (e2) {
      alert(e2.message);
    } finally {
      setSaving(false);
    }
  }

  if (error) return (<><div className="header"><button className="back" onClick={() => navigate(-1)}>← Quay lại</button></div><ErrorBox message={error} onRetry={load} /></>);
  if (!deal) return (<><div className="header"><button className="back" onClick={() => navigate(-1)}>← Quay lại</button></div><Loading /></>);

  const totalPhaiTra = scheds.reduce((s, x) => s + Number(x.amount || 0), 0);
  const totalDaTra = scheds.reduce((s, x) => s + Number(x.paid_amount || 0), 0);

  return (
    <>
      <div className="header">
        <button className="back" onClick={() => navigate(-1)}>← Quay lại</button>
        <h1 style={{ marginTop: 4 }}>Chi tiết giao dịch</h1>
      </div>

      <div className="card">
        <div className="row between">
          <div style={{ fontWeight: 800, fontSize: 22, color: '#1B2A4A' }}>{fmtMoney(deal.value)}</div>
          <DealStatusBadge status={deal.status} />
        </div>
        <div className="mt" style={{ lineHeight: 1.9 }}>
          <div>👤 Khách hàng: <Link to={`/leads/${deal.lead_id}`}>{deal.lead_name}</Link> · {deal.lead_phone}</div>
          <div>🏠 Căn: {deal.property_code ? `${deal.property_code} (${deal.project_name})` : 'Chưa gắn căn'}</div>
          <div className="muted">Tạo lúc: {fmtDateTime(deal.created_at)}</div>
          {deal.closed_at && <div className="muted">Chốt lúc: {fmtDateTime(deal.closed_at)}</div>}
        </div>
      </div>

      {deal.status === 'cho_duyet' && (
        <div className="field">
          <button className="btn btn-primary" onClick={closeDeal} disabled={closing}>
            {closing ? 'Đang chốt...' : '🎉 Chốt deal'}
          </button>
        </div>
      )}
      {deal.status === 'da_chot' && (
        <div className="demo-note">✅ Giao dịch đã chốt thành công. Chúc mừng!</div>
      )}

      {/* Timeline trạng thái deal */}
      {['giu_cho', 'dat_coc', 'ky_hd', 'ban_giao'].includes(deal.status) && (
        <>
          <div className="section-title" style={{ padding: '12px 16px 0' }}>📍 Tiến trình giao dịch</div>
          <DealStepper status={deal.status} />
        </>
      )}

      {/* Hold queue */}
      {deal.status === 'giu_cho' && (
        <div className="card" style={{ borderLeft: '4px solid var(--amber)' }}>
          <div className="row between">
            <div style={{ fontWeight: 800, fontSize: 16 }}>🔒 Đang giữ chỗ</div>
            {deal.queue_position && (
              <span className="badge badge-amber" style={{ fontSize: 14, padding: '6px 12px' }}>
                Ưu tiên #{deal.queue_position}
              </span>
            )}
          </div>
          {Array.isArray(deal.queue_list) && deal.queue_list.length > 1 && (
            <div className="mt">
              <div className="section-title">📋 Hàng đợi giữ chỗ ({deal.queue_list.length})</div>
              {deal.queue_list.map((qItem, qi) => (
                <div key={qi} className="row between" style={{ padding: '8px 0', borderTop: qi > 0 ? '1px solid var(--line)' : 'none' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>
                      {qItem.queue_position === 1 ? '🥇' : qItem.queue_position === 2 ? '🥈' : '🥉'} {qItem.customer_name}
                    </div>
                    <div className="muted">
                      Giữ {fmtMoney(qItem.hold_amount)}{qItem.hold_expires_at ? ` · Hạn: ${fmtDate(qItem.hold_expires_at)}` : ''}
                    </div>
                  </div>
                  <span className={`badge ${qItem.queue_position === 1 ? 'badge-amber' : 'badge-gray'}`}>
                    #{qItem.queue_position}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="row mt">
            {deal.queue_position === 1 && (
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setShowDepositModal(true)}>
                💰 Chuyển sang đặt cọc
              </button>
            )}
            <button className="btn btn-danger-outline" style={{ flex: 1, width: 'auto' }} onClick={() => setShowCancelModal(true)}>
              ❌ Hủy giữ chỗ
            </button>
          </div>
        </div>
      )}

      <div className="tabs">
        <button className={`tab ${tab === 'info' ? 'active' : ''}`} onClick={() => setTab('info')}>Thông tin</button>
        <button className={`tab ${tab === 'thanhtoan' ? 'active' : ''}`} onClick={() => setTab('thanhtoan')}>💰 Lịch thanh toán</button>
      </div>

      {tab === 'thanhtoan' && (
        <>
          {schedLoading && <Loading />}
          {!schedLoading && scheds.length > 0 && (
            <div className="card">
              <div className="kpi-grid">
                <div className="kpi"><div className="num">{fmtMoney(totalPhaiTra)}</div><div className="lbl">Tổng phải trả</div></div>
                <div className="kpi"><div className="num" style={{ color: '#1d9e6c' }}>{fmtMoney(totalDaTra)}</div><div className="lbl">Đã trả</div></div>
                <div className="kpi"><div className="num" style={{ color: totalPhaiTra - totalDaTra > 0 ? '#e05252' : '#1d9e6c' }}>{fmtMoney(totalPhaiTra - totalDaTra)}</div><div className="lbl">Còn nợ</div></div>
              </div>
            </div>
          )}
          {!schedLoading && scheds.length === 0 && <Empty icon="💰" text="Chưa có đợt thanh toán nào" />}

          {!schedLoading && scheds.map((s) => {
            const conNo = Number(s.con_no ?? (Number(s.amount || 0) - Number(s.paid_amount || 0)));
            return (
              <div className="card" key={s.id}>
                <div className="row between">
                  <div className="grow">
                    <div style={{ fontWeight: 700 }}>Đợt {s.dot_number}{s.label ? ` — ${s.label}` : ''}</div>
                    <div className="muted">📅 Đến hạn: {s.due_date ? fmtDate(s.due_date) : '—'}{s.note ? ` · ${s.note}` : ''}</div>
                    <div className="mt">
                      <span>Phải trả: <b>{fmtMoney(s.amount)}</b></span>
                      {' · '}Đã trả: <b style={{ color: '#1d9e6c' }}>{fmtMoney(s.paid_amount)}</b>
                      {conNo > 0 && <> · Còn nợ: <b style={{ color: '#e05252' }}>{fmtMoney(conNo)}</b></>}
                    </div>
                  </div>
                  <ScheduleBadge s={s} />
                </div>
                <div className="row mt">
                  {conNo > 0 && (
                    <button className="btn btn-navy btn-sm" style={{ flex: 1 }} onClick={() => paySchedule(s)}>💵 Ghi nhận thanh toán</button>
                  )}
                  <button className="btn btn-outline btn-sm" style={{ width: 'auto' }} onClick={() => deleteSchedule(s)}>🗑️</button>
                </div>
              </div>
            );
          })}

          <div className="row" style={{ padding: '0 16px' }}>
            <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => { setShowAddForm(!showAddForm); setShowGenForm(false); }}>➕ Tạo đợt</button>
            <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => { setShowGenForm(!showGenForm); setShowAddForm(false); }}>⚡ Tạo tự động</button>
          </div>

          {showAddForm && (
            <form onSubmit={addSchedule}>
              <div className="card">
                <div className="section-title">➕ Thêm đợt thanh toán</div>
                <div className="field"><label>Tên đợt</label><input className="input" placeholder="VD: Đợt 1 — Đặt cọc" value={fLabel} onChange={(e) => setFLabel(e.target.value)} /></div>
                <div className="field"><label>Ngày đến hạn</label><input className="input" type="date" value={fDue} onChange={(e) => setFDue(e.target.value)} /></div>
                <div className="field">
                  <label>Số tiền (VNĐ) *</label>
                  <input className="input" inputMode="numeric" placeholder="VD: 500000000" value={fAmount} onChange={(e) => setFAmount(e.target.value.replace(/[^\d]/g, ''))} />
                  {fAmount && <div className="muted mt">= {fmtMoney(Number(fAmount))}</div>}
                </div>
                <div className="field"><label>Ghi chú</label><input className="input" placeholder="Không bắt buộc" value={fNote} onChange={(e) => setFNote(e.target.value)} /></div>
                <div className="field"><button className="btn btn-primary" disabled={saving}>{saving ? 'Đang lưu...' : '💾 Lưu đợt'}</button></div>
              </div>
            </form>
          )}

          {showGenForm && (
            <form onSubmit={generateSchedules}>
              <div className="card">
                <div className="section-title">⚡ Tạo lịch tự động</div>
                <div className="field"><label>Số đợt</label><input className="input" inputMode="numeric" value={gSoDot} onChange={(e) => setGSoDot(e.target.value.replace(/[^\d]/g, ''))} /></div>
                <div className="field"><label>Ngày bắt đầu</label><input className="input" type="date" value={gNgayBD} onChange={(e) => setGNgayBD(e.target.value)} /></div>
                <div className="field"><label>Khoảng cách giữa các đợt (ngày)</label><input className="input" inputMode="numeric" value={gKhoangCach} onChange={(e) => setGKhoangCach(e.target.value.replace(/[^\d]/g, ''))} /></div>
                <div className="field"><button className="btn btn-primary" disabled={saving}>{saving ? 'Đang tạo...' : '⚡ Tạo lịch'}</button></div>
              </div>
            </form>
          )}
        </>
      )}

      {/* Modal hủy giữ chỗ */}
      {showCancelModal && (
        <Modal title="❌ Hủy giữ chỗ" onClose={() => setShowCancelModal(false)}>
          <div className="field">
            <label>Lý do hủy *</label>
            <textarea
              className="input"
              rows={3}
              placeholder="VD: Khách đổi ý, không đủ tài chính..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
          </div>
          <div className="field row">
            <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowCancelModal(false)}>
              Đóng
            </button>
            <button className="btn btn-danger-outline" style={{ flex: 1, width: 'auto', background: '#fff1f1' }} onClick={cancelHold} disabled={acting}>
              {acting ? 'Đang hủy...' : 'Xác nhận hủy'}
            </button>
          </div>
        </Modal>
      )}

      {/* Modal chuyển sang đặt cọc */}
      {showDepositModal && (
        <Modal title="💰 Chuyển sang đặt cọc" onClose={() => setShowDepositModal(false)}>
          <div className="field">
            <label>Số tiền cọc (VNĐ) *</label>
            <input
              className="input"
              inputMode="numeric"
              placeholder="VD: 50000000"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value.replace(/[^\d]/g, ''))}
            />
            {depositAmount && <div className="muted mt">= {fmtMoney(Number(depositAmount))}</div>}
          </div>
          <div className="field row">
            <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowDepositModal(false)}>
              Đóng
            </button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={toDeposit} disabled={acting}>
              {acting ? 'Đang xử lý...' : 'Xác nhận đặt cọc'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
