import { Router } from 'express';
import { q, VN_TODAY } from '../db.js';
import { auth } from '../middleware/auth.js';

const router = Router();
router.use(auth);

const METRICS = ['cuoc_goi', 'lich_hen', 'lead_moi', 'deal_chot', 'doanh_so'];
const PERIODS = ['tuan', 'thang'];

const METRIC_LABELS = {
  cuoc_goi: 'Cuộc gọi',
  lich_hen: 'Lịch hẹn hoàn thành',
  lead_moi: 'Lead mới',
  deal_chot: 'Deal chốt',
  doanh_so: 'Doanh số (VND)',
};

// Khoảng thời gian tính theo giờ Việt Nam
function periodRange(period) {
  if (period === 'tuan') {
    // Đầu tuần (thứ 2) -> hiện tại, theo giờ VN
    return {
      from: `date_trunc('week', ${VN_TODAY})`,
      to: `${VN_TODAY} + interval '1 day'`,
    };
  }
  // Mặc định: từ đầu tháng -> hiện tại
  return {
    from: `date_trunc('month', ${VN_TODAY})`,
    to: `${VN_TODAY} + interval '1 day'`,
  };
}

// Tính số thực tế cho 1 metric trong kỳ
async function actualFor(metric, userId, range) {
  const { from, to } = range;
  switch (metric) {
    case 'cuoc_goi': {
      const { rows } = await q(
        `SELECT COUNT(*)::int AS v FROM call_logs
         WHERE user_id = $1 AND called_at >= ${from} AND called_at < ${to}`,
        [userId]
      );
      return rows[0].v;
    }
    case 'lich_hen': {
      const { rows } = await q(
        `SELECT COUNT(*)::int AS v FROM follow_ups
         WHERE assigned_to = $1 AND status = 'done'
           AND done_at >= ${from} AND done_at < ${to}`,
        [userId]
      );
      return rows[0].v;
    }
    case 'lead_moi': {
      const { rows } = await q(
        `SELECT COUNT(*)::int AS v FROM leads
         WHERE assigned_to = $1 AND created_at >= ${from} AND created_at < ${to}`,
        [userId]
      );
      return rows[0].v;
    }
    case 'deal_chot': {
      const { rows } = await q(
        `SELECT COUNT(*)::int AS v FROM deals
         WHERE sale_id = $1 AND status IN ('ky_hd', 'ban_giao')
           AND COALESCE(contract_at, created_at) >= ${from}
           AND COALESCE(contract_at, created_at) < ${to}`,
        [userId]
      );
      return rows[0].v;
    }
    case 'doanh_so': {
      const { rows } = await q(
        `SELECT COALESCE(SUM(agreed_price), 0)::numeric AS v FROM deals
         WHERE sale_id = $1 AND status IN ('ky_hd', 'ban_giao')
           AND COALESCE(contract_at, created_at) >= ${from}
           AND COALESCE(contract_at, created_at) < ${to}`,
        [userId]
      );
      return Number(rows[0].v);
    }
    default:
      return 0;
  }
}

// Lấy chỉ tiêu KPI của user hiện tại
router.get('/targets', async (req, res) => {
  try {
    const { rows } = await q(
      `SELECT metric, period, target_value, updated_at FROM kpi_targets
       WHERE user_id = $1 AND workspace_id = $2
       ORDER BY period, metric`,
      [req.user.id, req.user.workspace_id]
    );
    res.json(rows.map((r) => ({
      ...r,
      target_value: Number(r.target_value),
      label: METRIC_LABELS[r.metric] || r.metric,
    })));
  } catch (err) {
    console.error('[kpis:targets]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// Cập nhật chỉ tiêu (upsert theo từng metric+period)
router.put('/targets', async (req, res) => {
  const items = Array.isArray(req.body) ? req.body : req.body?.targets;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Body phải là mảng [{metric, period, target_value}]' });
  }
  for (const it of items) {
    if (!METRICS.includes(it.metric) || !PERIODS.includes(it.period || 'thang')) {
      return res.status(400).json({ error: `metric/period không hợp lệ: ${it.metric}/${it.period}` });
    }
    if (it.target_value === undefined || Number(it.target_value) < 0) {
      return res.status(400).json({ error: `target_value không hợp lệ cho ${it.metric}` });
    }
  }
  try {
    const out = [];
    for (const it of items) {
      const period = it.period || 'thang';
      const { rows } = await q(
        `INSERT INTO kpi_targets (workspace_id, user_id, metric, period, target_value, updated_at)
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (workspace_id, user_id, metric, period)
         DO UPDATE SET target_value = EXCLUDED.target_value, updated_at = now()
         RETURNING metric, period, target_value`,
        [req.user.workspace_id, req.user.id, it.metric, period, Number(it.target_value)]
      );
      out.push({ ...rows[0], target_value: Number(rows[0].target_value) });
    }
    res.json(out);
  } catch (err) {
    console.error('[kpis:upsert]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// Tổng hợp KPI: thực tế vs chỉ tiêu, kèm % hoàn thành
router.get('/summary', async (req, res) => {
  const period = req.query.period === 'tuan' ? 'tuan' : 'thang';
  try {
    const { rows: targets } = await q(
      `SELECT metric, target_value FROM kpi_targets
       WHERE user_id = $1 AND workspace_id = $2 AND period = $3`,
      [req.user.id, req.user.workspace_id, period]
    );
    const range = periodRange(period);
    const metrics = METRICS.includes(req.query.metric) ? [req.query.metric] : METRICS;
    const result = [];
    for (const m of metrics) {
      const t = targets.find((x) => x.metric === m);
      const target = t ? Number(t.target_value) : 0;
      const actual = await actualFor(m, req.user.id, range);
      result.push({
        metric: m,
        label: METRIC_LABELS[m],
        period,
        target,
        actual,
        percent: target > 0 ? Math.round((Number(actual) / target) * 1000) / 10 : null,
        dat: target > 0 ? Number(actual) >= target : null,
      });
    }
    res.json({ period, metrics: result });
  } catch (err) {
    console.error('[kpis:summary]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

export default router;
