import { STAGE_LABELS } from '../api.js';

export function Loading() {
  return <div className="spinner" />;
}

export function Empty({ icon = '📭', text = 'Chưa có dữ liệu' }) {
  return (
    <div className="state">
      <div className="big">{icon}</div>
      <div>{text}</div>
    </div>
  );
}

export function ErrorBox({ message, onRetry }) {
  return (
    <div>
      <div className="error-box">⚠️ {message}</div>
      {onRetry && (
        <div className="field">
          <button className="btn btn-outline" onClick={onRetry}>Thử lại</button>
        </div>
      )}
    </div>
  );
}

export function ScoreBadge({ score }) {
  const cls = score >= 80 ? 'badge-score-hi' : score >= 50 ? 'badge-score-mid' : 'badge-score-lo';
  return <span className={`badge ${cls}`}>⭐ {score}</span>;
}

export function StageBadge({ status }) {
  if (status === 'mat') return <span className="badge badge-mat">Mất</span>;
  return <span className="badge badge-stage">{STAGE_LABELS[status] || status}</span>;
}

export function DealStatusBadge({ status }) {
  const map = {
    cho_duyet: ['badge-amber', 'Chờ duyệt'],
    giu_cho: ['badge-amber', '🔒 Giữ chỗ'],
    dat_coc: ['badge-stage', '💰 Đặt cọc'],
    ky_hd: ['badge-green', '📝 Ký HĐ'],
    ban_giao: ['badge-green', '🔑 Bàn giao'],
    da_chot: ['badge-green', 'Đã chốt'],
    huy: ['badge-gray', 'Hủy'],
    huy_giu_cho: ['badge-gray', 'Đã hủy giữ chỗ'],
  };
  const [cls, lbl] = map[status] || ['badge-gray', status];
  return <span className={`badge ${cls}`}>{lbl}</span>;
}

export function PropertyStatusBadge({ status }) {
  const map = { dang_ban: ['badge-green', 'Đang bán'], giu_cho: ['badge-amber', 'Giữ chỗ'], da_ban: ['badge-gray', 'Đã bán'] };
  const [cls, lbl] = map[status] || ['badge-gray', status];
  return <span className={`badge ${cls}`}>{lbl}</span>;
}
