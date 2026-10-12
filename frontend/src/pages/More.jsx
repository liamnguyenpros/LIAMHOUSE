import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUser, logout, api } from '../api.js';

export default function More() {
  const navigate = useNavigate();
  const user = getUser();
  const [aiBalance, setAiBalance] = useState(null);

  useEffect(() => {
    api('/ai/quota').then((q) => setAiBalance(q.balance)).catch(() => {});
  }, []);

  const menu = [
    { icon: '🤖', label: 'Trợ lý AI', to: '/ai-chat', badge: aiBalance != null ? `⚡${aiBalance}` : null },
    { icon: '➕', label: 'Thêm lead mới', to: '/leads/them' },
    { icon: '🤝', label: 'Tạo giao dịch', to: '/giao-dich/them' },
    { icon: '📊', label: 'KPI cá nhân', to: '/kpi' },
    { icon: '⚠️', label: 'Nhắc nợ', to: '/nhac-no' },
    { icon: '💰', label: 'Hoa hồng', to: '/hoa-hong' },
    { icon: '🏷️', label: 'Khuyến mãi', to: '/khuyen-mai' },
    { icon: '⚙️', label: 'Cấu hình hoa hồng', to: '/cau-hinh-hoa-hong' },
    { icon: '📞', label: 'Chiến dịch gọi', to: '/chien-dich-goi' },
    { icon: '🔌', label: 'Tích hợp gọi điện', to: '/tich-hop' },
    { icon: '🔔', label: 'Thông báo', to: '/thong-bao' },
  ];

  return (
    <>
      <div className="header"><h1>➕ Thêm</h1></div>

      <div className="card">
        <div className="row">
          <div style={{ fontSize: 44 }}>👤</div>
          <div className="grow">
            <div style={{ fontWeight: 800, fontSize: 18 }}>{user?.full_name}</div>
            <div className="muted">📱 {user?.phone}</div>
            <div className="muted">Vai trò: Sale · Gói: Cá nhân</div>
          </div>
        </div>
      </div>

      {menu.map((m) => (
        <div className="card tappable" key={m.to} onClick={() => navigate(m.to)}>
          <div className="row between">
            <div style={{ fontWeight: 600 }}>{m.icon} {m.label}</div>
            <div className="row" style={{ gap: 8 }}>
              {m.badge && <span className="chip" style={{ fontSize: 12 }}>{m.badge}</span>}
              <div className="muted">›</div>
            </div>
          </div>
        </div>
      ))}

      <div className="field" style={{ marginTop: 24 }}>
        <button className="btn btn-danger-outline" onClick={() => { if (window.confirm('Đăng xuất khỏi LIAMHOUSE?')) logout(); }}>
          🚪 Đăng xuất
        </button>
      </div>

      <div className="state">
        <div className="muted">LIAMHOUSE CRM · T1 MVP v1.0</div>
      </div>
    </>
  );
}
