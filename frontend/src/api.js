// API client: tự gắn JWT, tự logout khi 401
// Chế độ demo (VITE_API_MOCK=1): dùng mock data trong bundle, không cần backend
import { mockApi } from './api-mock.js';
const IS_MOCK = import.meta.env.VITE_API_MOCK === '1';

export function getToken() {
  return localStorage.getItem('lh_token');
}
export function getUser() {
  try {
    return JSON.parse(localStorage.getItem('lh_user'));
  } catch {
    return null;
  }
}
export function getRefreshToken() {
  return localStorage.getItem('lh_refresh');
}
export function logout() {
  localStorage.removeItem('lh_token');
  localStorage.removeItem('lh_refresh');
  localStorage.removeItem('lh_user');
  window.location.href = IS_MOCK ? '#/dang-nhap' : '/dang-nhap';
}

async function tryRefresh() {
  const rt = getRefreshToken();
  if (!rt || IS_MOCK) return false;
  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rt }),
    });
    if (!res.ok) return false;
    const j = await res.json();
    if (j.token) {
      localStorage.setItem('lh_token', j.token);
      return true;
    }
  } catch {
    /* bỏ qua, sẽ logout */
  }
  return false;
}

export async function api(path, opts = {}, _retried) {
  if (IS_MOCK) return mockApi(path, opts);
  const res = await fetch('/api' + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { Authorization: 'Bearer ' + getToken() } : {}),
      ...(opts.headers || {}),
    },
  });
  if (res.status === 401) {
    // access hết hạn (2h): thử refresh 1 lần rồi gọi lại, không được mới logout
    if (!_retried && (await tryRefresh())) {
      return api(path, opts, true);
    }
    logout();
    throw new Error('Phiên đăng nhập hết hạn');
  }
  if (!res.ok) {
    let msg = 'Có lỗi xảy ra';
    try {
      const j = await res.json();
      msg = j.error || msg;
    } catch {
      /* giữ msg mặc định */
    }
    const err = new Error(msg);
    err.status = res.status; // để UI phân biệt 402 (hết quota) với lỗi khác
    throw err;
  }
  return res.json();
}

// Định dạng tiền: 3.2e9 -> "3,2 tỷ"
export function fmtMoney(v) {
  if (v == null) return '—';
  const n = Number(v);
  if (n >= 1e9) {
    const ty = n / 1e9;
    return (Number.isInteger(ty) ? ty : ty.toFixed(1).replace('.', ',')) + ' tỷ';
  }
  return n.toLocaleString('vi-VN') + 'đ';
}

export function fmtDateTime(s) {
  if (!s) return '—';
  const d = new Date(s.replace(' ', 'T'));
  if (isNaN(d)) return s;
  return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function fmtDate(s) {
  if (!s) return '—';
  const d = new Date(s.replace(' ', 'T'));
  if (isNaN(d)) return s;
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export const STAGE_LABELS = {
  moi: 'Mới',
  da_lien_he: 'Đã liên hệ',
  dang_tu_van: 'Đang tư vấn',
  da_dan_xem: 'Đã dẫn xem',
  dat_coc: 'Đặt cọc',
  ky_hd: 'Ký HĐ',
  ban_giao: 'Bàn giao',
  mat: 'Mất',
};
export const STAGES = ['moi', 'da_lien_he', 'dang_tu_van', 'da_dan_xem', 'dat_coc', 'ky_hd', 'ban_giao'];

export const SOURCE_LABELS = {
  facebook: 'Facebook',
  tiktok: 'TikTok',
  referral: 'Giới thiệu',
  walk_in: 'Khách vãng lai',
  website: 'Website',
  data_mua: 'Data mua',
  khac: 'Khác',
};

export const ACTIVITY_LABELS = {
  goi_dien: '📞 Gọi điện',
  gap_mat: '🤝 Gặp mặt',
  zalo: '💬 Zalo',
  ghi_chu: '📝 Ghi chú',
  doi_trang_thai: '🔄 Đổi trạng thái',
};

export const CALL_OUTCOME_LABELS = {
  nghe_may: 'Nghe máy',
  khong_nghe: 'Không nghe máy',
  hen_lai: 'Hẹn gọi lại',
  quan_tam: 'Quan tâm',
  tu_choi: 'Từ chối',
};

export const DOC_TYPE_LABELS = {
  phap_ly: 'Pháp lý',
  mat_bang: 'Mặt bằng',
  tien_do: 'Tiến độ',
};

// Định dạng thời lượng gọi: 75 -> "1 phút 15 giây"
export function fmtDuration(sec) {
  const s = Number(sec) || 0;
  if (s < 60) return `${s} giây`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m} phút ${r} giây` : `${m} phút`;
}

// Tải file binary (Excel...) có kèm JWT — backend demo chưa có thì báo lỗi thân thiện
export async function downloadFile(path, filename) {
  if (IS_MOCK) throw new Error('Xuất file cần kết nối backend thật (bản demo dùng dữ liệu mẫu)');
  const res = await fetch('/api' + path, {
    headers: { ...(getToken() ? { Authorization: 'Bearer ' + getToken() } : {}) },
  });
  if (res.status === 401) {
    logout();
    throw new Error('Phiên đăng nhập hết hạn');
  }
  if (!res.ok) throw new Error('Không tải được file');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
