import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { pool } from './db.js';
import { requireJwtSecret } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import dashboardRoutes from './routes/dashboard.js';
import leadsRoutes from './routes/leads.js';
import followupsRoutes from './routes/followups.js';
import activitiesRoutes from './routes/activities.js';
import projectsRoutes from './routes/projects.js';
import dealsRoutes from './routes/deals.js';
import notificationsRoutes from './routes/notifications.js';
import aiRoutes from './routes/ai.js';
import callLogsRoutes from './routes/call-logs.js';
import kpisRoutes from './routes/kpis.js';
import projectDocsRoutes from './routes/project-docs.js';
import exportRoutes from './routes/export.js';
import shareRoutes from './routes/share.js';
import matchingRoutes from './routes/matching.js';
import paymentSchedulesRoutes from './routes/payment-schedules.js';
import commissionsRoutes from './routes/commissions.js';
import callCampaignsRoutes from './routes/call-campaigns.js';
import integrationsRoutes from './routes/integrations.js';
import pricePoliciesRoutes from './routes/price-policies.js';
import commissionRulesRoutes from './routes/commission-rules.js';
import publicLeadsRoutes from './routes/public-leads.js';
import apiKeysRoutes from './routes/api-keys.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Fail-fast: production thiếu JWT_SECRET thì từ chối khởi động
requireJwtSecret();

const app = express();

// Security headers cho API JSON (không ảnh hưởng PWA frontend gọi qua fetch/CORS)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      // Bỏ upgrade-insecure-requests: server chạy HTTP qua Tailscale, không có SSL
      'upgrade-insecure-requests': null,
    },
  },
}));

// CORS: chỉ origin trong CORS_ORIGIN (phân tách dấu phẩy); mặc định chỉ localhost dev
function parseOrigins() {
  const raw = process.env.CORS_ORIGIN;
  if (raw && raw.trim()) return raw.split(',').map((s) => s.trim()).filter(Boolean);
  return [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
  ];
}
app.use(cors({ origin: parseOrigins(), credentials: true }));

app.use(express.json());

// Rate limit: auth nghiêm (chống brute-force), toàn API vừa phải
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Quá nhiều yêu cầu đăng nhập, vui lòng thử lại sau 15 phút' },
});
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Quá nhiều yêu cầu, vui lòng thử lại sau' },
});
app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, service: 'liamhouse-backend', db: 'postgres' });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'db_unreachable' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/follow-ups', followupsRoutes);
app.use('/api/activities', activitiesRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/deals', dealsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/call-logs', callLogsRoutes);
app.use('/api/kpis', kpisRoutes);
app.use('/api', publicLeadsRoutes); // POST /api/public/leads — webhook ngoài, KHÔNG cần JWT (phải đứng trước các router /api có auth)
app.use('/api', projectDocsRoutes); // GET+POST /projects/:id/docs, DELETE /project-docs/:id
app.use('/api/export', exportRoutes);
app.use('/api/share', shareRoutes);
app.use('/api/matching', matchingRoutes);
app.use('/api', paymentSchedulesRoutes); // /deals/:dealId/payment-schedules*, /payment-schedules/*
app.use('/api/commissions', commissionsRoutes);
app.use('/api/price-policies', pricePoliciesRoutes);
app.use('/api/commission-rules', commissionRulesRoutes);
app.use('/api/call-campaigns', callCampaignsRoutes);
app.use('/api/integrations', integrationsRoutes);
app.use('/api/api-keys', apiKeysRoutes);

// Phục vụ frontend PWA (build thật, gọi API cùng origin qua /api/*)
const FRONT_DIST = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(FRONT_DIST, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    }
  },
}));
app.get(/^(?!\/api).*/, (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.sendFile(path.join(FRONT_DIST, 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`LIAMHOUSE backend (PostgreSQL) chạy tại http://localhost:${PORT}`);
});
