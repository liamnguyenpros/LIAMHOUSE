import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom';
// Bản demo (VITE_API_MOCK=1) dùng HashRouter để mở được bằng file://
const Router = import.meta.env.VITE_API_MOCK === '1' ? HashRouter : BrowserRouter;
import { getToken } from './api.js';
import BottomNav from './components/BottomNav.jsx';
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import Leads from './pages/Leads.jsx';
import LeadDetail from './pages/LeadDetail.jsx';
import AddLead from './pages/AddLead.jsx';
import Schedule from './pages/Schedule.jsx';
import Projects from './pages/Projects.jsx';
import ProjectDetail from './pages/ProjectDetail.jsx';
import Deals from './pages/Deals.jsx';
import DealDetail from './pages/DealDetail.jsx';
import Notifications from './pages/Notifications.jsx';
import More from './pages/More.jsx';
import Kpi from './pages/Kpi.jsx';
import NhacNo from './pages/NhacNo.jsx';
import AiChat from './pages/AiChat.jsx';
import Commission from './pages/Commission.jsx';
import Promotions from './pages/Promotions.jsx';
import CommissionRules from './pages/CommissionRules.jsx';
import CallCampaigns from './pages/CallCampaigns.jsx';
import Integrations from './pages/Integrations.jsx';
import ApiKeys from './pages/ApiKeys.jsx';

function RequireAuth({ children }) {
  if (!getToken()) return <Navigate to="/dang-nhap" replace />;
  return children;
}

function Shell() {
  return (
    <div className="phone">
      <div className="screen">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/leads" element={<Leads />} />
          <Route path="/leads/them" element={<AddLead />} />
          <Route path="/leads/:id" element={<LeadDetail />} />
          <Route path="/lich" element={<Schedule />} />
          <Route path="/du-an" element={<Projects />} />
          <Route path="/du-an/:id" element={<ProjectDetail />} />
          <Route path="/giao-dich" element={<Deals />} />
          <Route path="/giao-dich/them" element={<Deals mode="create" />} />
          <Route path="/giao-dich/:id" element={<DealDetail />} />
          <Route path="/thong-bao" element={<Notifications />} />
          <Route path="/kpi" element={<Kpi />} />
          <Route path="/nhac-no" element={<NhacNo />} />
          <Route path="/hoa-hong" element={<Commission />} />
          <Route path="/khuyen-mai" element={<Promotions />} />
          <Route path="/cau-hinh-hoa-hong" element={<CommissionRules />} />
          <Route path="/chien-dich-goi" element={<CallCampaigns />} />
          <Route path="/tich-hop" element={<Integrations />} />
          <Route path="/api-keys" element={<ApiKeys />} />
          <Route path="/ai-chat" element={<AiChat />} />
          <Route path="/them" element={<More />} />
        </Routes>
      </div>
      <BottomNav />
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/dang-nhap" element={<Login />} />
        <Route
          path="/*"
          element={
            <RequireAuth>
              <Shell />
            </RequireAuth>
          }
        />
      </Routes>
    </Router>
  );
}
