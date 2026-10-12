import { NavLink } from 'react-router-dom';

const TABS = [
  { to: '/', label: 'Trang chủ', ico: '🏠', end: true },
  { to: '/leads', label: 'Leads', ico: '👥' },
  { to: '/lich', label: 'Lịch', ico: '📅' },
  { to: '/du-an', label: 'Dự án', ico: '🏢' },
  { to: '/them', label: 'Thêm', ico: '➕' },
];

export default function BottomNav() {
  return (
    <nav className="bottomnav">
      {TABS.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => (isActive ? 'active' : '')}>
          <span className="ico">{t.ico}</span>
          <span>{t.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
