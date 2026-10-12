import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api, STAGES, STAGE_LABELS, SOURCE_LABELS, ACTIVITY_LABELS, CALL_OUTCOME_LABELS, fmtMoney, fmtDateTime, fmtDuration } from '../api.js';
import { Loading, ErrorBox, Empty, ScoreBadge, DealStatusBadge } from '../components/ui.jsx';

export const LOAI_BDS_LABELS = { can_ho: 'Căn hộ', nha_pho: 'Nhà phố', dat_nen: 'Đất nền', biet_thu: 'Biệt thự', shophouse: 'Shophouse', van_phong: 'Văn phòng' };
export const MUC_DICH_LABELS = { de_o: 'Để ở', dau_tu: 'Đầu tư', cho_thue: 'Cho thuê' };

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [lead, setLead] = useState(null);
  const [calls, setCalls] = useState([]);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('lich');

  // form lịch
  const [fuTitle, setFuTitle] = useState('');
  const [fuDue, setFuDue] = useState('');
  const [fuNote, setFuNote] = useState('');
  // form hoạt động
  const [actType, setActType] = useState('goi_dien');
  const [actContent, setActContent] = useState('');
  // form cuộc gọi
  const [clMin, setClMin] = useState('');
  const [clOutcome, setClOutcome] = useState('nghe_may');
  const [clNote, setClNote] = useState('');
  const [clSaving, setClSaving] = useState(false);
  // form nhu cầu
  const [dLoai, setDLoai] = useState('');
  const [dKhuVuc, setDKhuVuc] = useState('');
  const [dNsMin, setDNsMin] = useState('');
  const [dNsMax, setDNsMax] = useState('');
  const [dDtMin, setDDtMin] = useState('');
  const [dDtMax, setDDtMax] = useState('');
  const [dMucDich, setDMucDich] = useState('');
  const [dSaving, setDSaving] = useState(false);
  // gợi ý khớp nhu cầu
  const [matches, setMatches] = useState(null);
  const [matchesLoading, setMatchesLoading] = useState(false);

  async function load() {
    setError('');
    try {
      const [ld, cl] = await Promise.all([api(`/leads/${id}`), api(`/call-logs?lead_id=${id}`)]);
      setLead(ld);
      setCalls(cl);
      fillDemandForm(ld);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => { load(); }, [id]);

  function fillDemandForm(ld) {
    let d = null;
    try { d = ld.demand_json ? JSON.parse(ld.demand_json) : null; } catch { /* ignore */ }
    setDLoai(d?.loai || '');
    setDKhuVuc(d?.khu_vuc || '');
    setDNsMin(d?.ngan_sach_min != null ? String(d.ngan_sach_min) : '');
    setDNsMax(d?.ngan_sach_max != null ? String(d.ngan_sach_max) : '');
    setDDtMin(d?.dien_tich_min != null ? String(d.dien_tich_min) : '');
    setDDtMax(d?.dien_tich_max != null ? String(d.dien_tich_max) : '');
    setDMucDich(d?.muc_dich || '');
  }

  async function saveDemand(e) {
    e.preventDefault();
    setDSaving(true);
    try {
      await api(`/leads/${id}/demand`, {
        method: 'PUT',
        body: JSON.stringify({
          loai: dLoai || null,
          khu_vuc: dKhuVuc.trim() || null,
          ngan_sach_min: dNsMin ? Number(dNsMin) : null,
          ngan_sach_max: dNsMax ? Number(dNsMax) : null,
          dien_tich_min: dDtMin ? Number(dDtMin) : null,
          dien_tich_max: dDtMax ? Number(dDtMax) : null,
          muc_dich: dMucDich || null,
        }),
      });
      setMatches(null); // reset gợi ý cũ
      load();
    } catch (e2) {
      alert(e2.message);
    } finally {
      setDSaving(false);
    }
  }

  async function loadMatches() {
    setMatchesLoading(true);
    try {
      const r = await api(`/matching/leads/${id}/properties`);
      setMatches(r.data || r || []);
    } catch (e2) {
      alert(e2.message);
    } finally {
      setMatchesLoading(false);
    }
  }

  function matchBadgeClass(score) {
    if (score >= 80) return 'badge-green';
    if (score >= 50) return 'badge-amber';
    return 'badge-gray';
  }

  function createDealFromMatch(prop) {
    navigate(`/giao-dich/them?lead=${id}&property=${prop.id}`);
  }

  async function changeStage(status) {
    if (!window.confirm(`Chuyển lead sang bước "${STAGE_LABELS[status]}"?`)) return;
    await api(`/leads/${id}/stage`, { method: 'PATCH', body: JSON.stringify({ status }) });
    load();
  }

  async function addFollowUp(e) {
    e.preventDefault();
    if (!fuTitle.trim() || !fuDue) return alert('Vui lòng nhập tiêu đề và thời gian');
    await api('/follow-ups', {
      method: 'POST',
      body: JSON.stringify({
        lead_id: id, title: fuTitle.trim(),
        due_at: fuDue.replace('T', ' ') + ':00', note: fuNote.trim(),
      }),
    });
    setFuTitle(''); setFuDue(''); setFuNote('');
    load();
  }

  async function addActivity(e) {
    e.preventDefault();
    if (!actContent.trim()) return;
    await api('/activities', {
      method: 'POST',
      body: JSON.stringify({ lead_id: id, type: actType, content: actContent.trim() }),
    });
    setActContent('');
    load();
  }

  async function completeFu(fuId) {
    await api(`/follow-ups/${fuId}/complete`, { method: 'POST' });
    load();
  }

  async function addCallLog(e) {
    e.preventDefault();
    setClSaving(true);
    try {
      await api('/call-logs', {
        method: 'POST',
        body: JSON.stringify({
          lead_id: id,
          duration_sec: Math.round(Number(clMin || 0) * 60),
          outcome: clOutcome,
          note: clNote.trim(),
        }),
      });
      setClMin(''); setClNote(''); setClOutcome('nghe_may');
      load();
    } catch (e2) {
      alert(e2.message);
    } finally {
      setClSaving(false);
    }
  }

  async function shareZalo() {
    try {
      const r = await api('/share/zalo', { method: 'POST', body: JSON.stringify({ type: 'lead', id }) });
      window.open('https://zalo.me/share?url=' + encodeURIComponent(r.share_url), '_blank');
    } catch (e) {
      alert(e.message);
    }
  }

  if (error) return (<><HeaderBack /><ErrorBox message={error} onRetry={load} /></>);
  if (!lead) return (<><HeaderBack /><Loading /></>);

  const stageIdx = STAGES.indexOf(lead.status);
  const demand = lead.demand_json ? JSON.parse(lead.demand_json) : null;

  return (
    <>
      <HeaderBack title={lead.full_name} />

      <div className="card">
        <div className="row between">
          <div className="grow">
            <div className="muted">📱 {lead.phone}{lead.zalo ? ` · Zalo: ${lead.zalo}` : ''}</div>
            <div className="muted">Nguồn: {SOURCE_LABELS[lead.source] || lead.source || '—'}</div>
            {demand && (
              <div className="muted">
                Nhu cầu: {[demand.loai && (LOAI_BDS_LABELS[demand.loai] || demand.loai), demand.khu_vuc].filter(Boolean).join(' · ')}
                {(demand.ngan_sach_min || demand.ngan_sach_max) && ` · NS: ${demand.ngan_sach_min ?? '?'}–${demand.ngan_sach_max ?? '?'} tỷ`}
                {demand.ngan_sach && !demand.ngan_sach_min && ` · ${demand.ngan_sach}`}
                {demand.muc_dich && ` · ${MUC_DICH_LABELS[demand.muc_dich] || demand.muc_dich}`}
              </div>
            )}
          </div>
          <ScoreBadge score={lead.score} />
        </div>
        <div className="row mt">
          <a className="btn btn-navy" style={{ flex: 1 }} href={`tel:${lead.phone}`}>📞 Gọi ngay</a>
          <button className="btn btn-outline" style={{ flex: 1 }} onClick={shareZalo}>🔗 Chia sẻ</button>
        </div>
      </div>

      {lead.status !== 'mat' && (
        <>
          <div className="section-title">Pipeline</div>
          <div className="stepper">
            {STAGES.map((s, i) => (
              <button key={s}
                className={`step ${i < stageIdx ? 'done' : ''} ${i === stageIdx ? 'current' : ''}`}
                onClick={() => i !== stageIdx && changeStage(s)}>
                {i < stageIdx ? '✓ ' : ''}{STAGE_LABELS[s]}
              </button>
            ))}
          </div>
          <div className="field">
            <button className="btn btn-danger-outline" onClick={() => changeStage('mat')}>Đánh dấu mất</button>
          </div>
        </>
      )}
      {lead.status === 'mat' && (
        <div className="demo-note">Lead này đã chuyển trạng thái "Mất".</div>
      )}

      <div className="tabs">
        <button className={`tab ${tab === 'lich' ? 'active' : ''}`} onClick={() => setTab('lich')}>Lịch chăm sóc</button>
        <button className={`tab ${tab === 'hd' ? 'active' : ''}`} onClick={() => setTab('hd')}>Hoạt động</button>
        <button className={`tab ${tab === 'goi' ? 'active' : ''}`} onClick={() => setTab('goi')}>Cuộc gọi</button>
        <button className={`tab ${tab === 'nhucau' ? 'active' : ''}`} onClick={() => setTab('nhucau')}>🎯 Nhu cầu</button>
        <button className={`tab ${tab === 'gd' ? 'active' : ''}`} onClick={() => setTab('gd')}>Giao dịch</button>
      </div>

      {tab === 'lich' && (
        <>
          {lead.follow_ups.length === 0 && <Empty icon="📅" text="Chưa có lịch chăm sóc nào" />}
          {lead.follow_ups.map((f) => (
            <div className="card" key={f.id}>
              <div className="row between">
                <div className="grow">
                  <div style={{ fontWeight: 700, textDecoration: f.status === 'done' ? 'line-through' : 'none' }}>{f.title}</div>
                  <div className="muted">⏰ {fmtDateTime(f.due_at)}{f.note ? ` · ${f.note}` : ''}</div>
                </div>
                {f.status === 'pending' && (
                  <button className="btn btn-navy" style={{ width: 'auto', minWidth: 48 }} onClick={() => completeFu(f.id)}>✓</button>
                )}
              </div>
            </div>
          ))}
          <div className="section-title">➕ Thêm lịch chăm sóc</div>
          <form onSubmit={addFollowUp}>
            <div className="field"><input className="input" placeholder="Tiêu đề (VD: Gọi lại báo giá)" value={fuTitle} onChange={(e) => setFuTitle(e.target.value)} /></div>
            <div className="field"><input className="input" type="datetime-local" value={fuDue} onChange={(e) => setFuDue(e.target.value)} /></div>
            <div className="field"><input className="input" placeholder="Ghi chú (không bắt buộc)" value={fuNote} onChange={(e) => setFuNote(e.target.value)} /></div>
            <div className="field"><button className="btn btn-primary">Thêm lịch</button></div>
          </form>
        </>
      )}

      {tab === 'hd' && (
        <>
          <div className="card">
            {lead.activities.length === 0 && <Empty icon="📝" text="Chưa có hoạt động nào" />}
            {lead.activities.map((a) => (
              <div className="timeline-item" key={a.id}>
                <div style={{ fontWeight: 600 }}>{ACTIVITY_LABELS[a.type] || a.type}</div>
                <div>{a.content}</div>
                <div className="muted">{fmtDateTime(a.created_at)}</div>
              </div>
            ))}
          </div>
          <div className="section-title">➕ Ghi hoạt động</div>
          <form onSubmit={addActivity}>
            <div className="field">
              <select className="select" value={actType} onChange={(e) => setActType(e.target.value)}>
                <option value="goi_dien">📞 Gọi điện</option>
                <option value="gap_mat">🤝 Gặp mặt</option>
                <option value="zalo">💬 Zalo</option>
                <option value="ghi_chu">📝 Ghi chú</option>
              </select>
            </div>
            <div className="field"><textarea className="textarea" placeholder="Nội dung..." value={actContent} onChange={(e) => setActContent(e.target.value)} /></div>
            <div className="field"><button className="btn btn-primary">Lưu hoạt động</button></div>
          </form>
        </>
      )}

      {tab === 'goi' && (
        <>
          {calls.length === 0 && <Empty icon="📞" text="Chưa ghi nhận cuộc gọi nào" />}
          {calls.map((c) => (
            <div className="card" key={c.id}>
              <div className="row between">
                <div className="grow">
                  <div style={{ fontWeight: 700 }}>{CALL_OUTCOME_LABELS[c.outcome] || c.outcome} · ⏱️ {fmtDuration(c.duration_sec)}</div>
                  {c.note && <div>{c.note}</div>}
                  <div className="muted">{fmtDateTime(c.called_at)}{c.ai_score != null ? ` · 🤖 AI: ${c.ai_score}/100` : ''}</div>
                </div>
              </div>
            </div>
          ))}
          <div className="section-title">➕ Ghi nhận cuộc gọi</div>
          <form onSubmit={addCallLog}>
            <div className="field">
              <label>Thời lượng (phút)</label>
              <input className="input" inputMode="decimal" placeholder="VD: 3" value={clMin} onChange={(e) => setClMin(e.target.value.replace(/[^\d.]/g, ''))} />
            </div>
            <div className="field">
              <label>Kết quả</label>
              <select className="select" value={clOutcome} onChange={(e) => setClOutcome(e.target.value)}>
                {Object.entries(CALL_OUTCOME_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Ghi chú</label>
              <textarea className="textarea" placeholder="Nội dung trao đổi..." value={clNote} onChange={(e) => setClNote(e.target.value)} />
            </div>
            <div className="field"><button className="btn btn-primary" disabled={clSaving}>{clSaving ? 'Đang lưu...' : '💾 Lưu cuộc gọi'}</button></div>
          </form>
        </>
      )}

      {tab === 'nhucau' && (
        <>
          <div className="section-title">🎯 Nhu cầu khách hàng</div>
          <form onSubmit={saveDemand}>
            <div className="card">
              <div className="field">
                <label>Loại BĐS</label>
                <select className="select" value={dLoai} onChange={(e) => setDLoai(e.target.value)}>
                  <option value="">— Chọn loại —</option>
                  {Object.entries(LOAI_BDS_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Khu vực</label>
                <input className="input" placeholder="VD: Quận 9, Thủ Đức..." value={dKhuVuc} onChange={(e) => setDKhuVuc(e.target.value)} />
              </div>
              <div className="row">
                <div className="field grow">
                  <label>Ngân sách từ (tỷ)</label>
                  <input className="input" inputMode="decimal" placeholder="VD: 2" value={dNsMin} onChange={(e) => setDNsMin(e.target.value.replace(/[^\d.]/g, ''))} />
                </div>
                <div className="field grow">
                  <label>đến (tỷ)</label>
                  <input className="input" inputMode="decimal" placeholder="VD: 3.5" value={dNsMax} onChange={(e) => setDNsMax(e.target.value.replace(/[^\d.]/g, ''))} />
                </div>
              </div>
              <div className="row">
                <div className="field grow">
                  <label>Diện tích từ (m²)</label>
                  <input className="input" inputMode="decimal" placeholder="VD: 50" value={dDtMin} onChange={(e) => setDDtMin(e.target.value.replace(/[^\d.]/g, ''))} />
                </div>
                <div className="field grow">
                  <label>đến (m²)</label>
                  <input className="input" inputMode="decimal" placeholder="VD: 80" value={dDtMax} onChange={(e) => setDDtMax(e.target.value.replace(/[^\d.]/g, ''))} />
                </div>
              </div>
              <div className="field">
                <label>Mục đích</label>
                <select className="select" value={dMucDich} onChange={(e) => setDMucDich(e.target.value)}>
                  <option value="">— Chọn mục đích —</option>
                  {Object.entries(MUC_DICH_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <button className="btn btn-primary" disabled={dSaving}>{dSaving ? 'Đang lưu...' : '💾 Lưu nhu cầu'}</button>
              </div>
            </div>
          </form>

          <div className="section-title">✨ Gợi ý phù hợp</div>
          {matches === null && (
            <div className="field">
              <button className="btn btn-outline" onClick={loadMatches} disabled={matchesLoading}>
                {matchesLoading ? 'Đang tìm...' : '🔍 Tìm căn phù hợp'}
              </button>
            </div>
          )}
          {matches !== null && (
            <>
              <div className="field">
                <button className="btn btn-outline btn-sm" onClick={loadMatches} disabled={matchesLoading}>
                  {matchesLoading ? 'Đang tìm...' : '🔄 Tìm lại'}
                </button>
              </div>
              {matches.length === 0 && <Empty icon="🔍" text="Chưa tìm thấy căn phù hợp với nhu cầu này" />}
              {matches.map((mch) => {
                const p = mch.property || {};
                const score = mch.match_score ?? 0;
                return (
                  <div className="card" key={p.id || mch.id}>
                    <div className="row between">
                      <div className="grow">
                        <div style={{ fontWeight: 700 }}>Căn {p.code || '—'}{mch.project_name ? ` · ${mch.project_name}` : ''}</div>
                        <div className="muted">{p.type ? (LOAI_BDS_LABELS[p.type] || p.type) + ' · ' : ''}{p.area ? `${p.area} m² · ` : ''}{fmtMoney(p.price)}</div>
                      </div>
                      <span className={`badge ${matchBadgeClass(score)}`}>{score}% khớp</span>
                    </div>
                    {(mch.match_reasons || []).length > 0 && (
                      <div className="chips mt">
                        {mch.match_reasons.map((r, i) => (
                          <span className="chip" key={i}>✓ {r}</span>
                        ))}
                      </div>
                    )}
                    <div className="field mt">
                      <button className="btn btn-navy btn-sm" onClick={() => createDealFromMatch(p)}>➕ Tạo deal với căn này</button>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </>
      )}

      {tab === 'gd' && (
        <>
          {lead.deals.length === 0 && <Empty icon="🤝" text="Chưa có giao dịch nào" />}
          {lead.deals.map((d) => (
            <Link key={d.id} to={`/giao-dich/${d.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="card tappable">
                <div className="row between">
                  <div className="grow">
                    <div style={{ fontWeight: 700 }}>{fmtMoney(d.value)}</div>
                    <div className="muted">{d.property_code ? `Căn ${d.property_code}` : 'Chưa gắn căn'}</div>
                  </div>
                  <DealStatusBadge status={d.status} />
                </div>
              </div>
            </Link>
          ))}
          <div className="field">
            <button className="btn btn-primary" onClick={() => navigate(`/giao-dich/them?lead=${id}`)}>➕ Tạo giao dịch</button>
          </div>
        </>
      )}
    </>
  );
}

function HeaderBack({ title }) {
  const navigate = useNavigate();
  return (
    <div className="header">
      <button className="back" onClick={() => navigate(-1)}>← Quay lại</button>
      {title && <h1 style={{ marginTop: 4 }}>{title}</h1>}
    </div>
  );
}
