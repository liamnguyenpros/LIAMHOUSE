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

// ============================================================================
// KPI CONFIGS + SNAPSHOTS (§3.15 / §3.16) — chỉ tiêu do quản lý đặt + chụp định kỳ
// ============================================================================

const CONFIG_METRICS = ['calls', 'leads_new', 'viewings', 'holds', 'deposits', 'deals_closed', 'revenue'];
const CONFIG_PERIODS = ['day', 'week', 'month'];
const CONFIG_ROLES = ['sale', 'truong_phong'];

const CONFIG_METRIC_LABELS = {
  calls: 'Cuộc gọi',
  leads_new: 'Lead mới',
  viewings: 'Lịch xem hoàn thành',
  holds: 'Giữ chỗ',
  deposits: 'Đặt cọc',
  deals_closed: 'Deal chốt',
  revenue: 'Doanh số (VND)',
};

const CONFIG_PERIOD_LABELS = { day: 'Ngày', week: 'Tuần', month: 'Tháng' };

// Khoảng thời gian cho hệ configs (day/week/month), theo giờ VN
function configPeriodRange(periodType) {
  if (periodType === 'day') {
    return { from: VN_TODAY, to: `${VN_TODAY} + interval '1 day'` };
  }
  if (periodType === 'week') {
    return { from: `date_trunc('week', ${VN_TODAY})`, to: `${VN_TODAY} + interval '1 day'` };
  }
  return { from: `date_trunc('month', ${VN_TODAY})`, to: `${VN_TODAY} + interval '1 day'` };
}

// Ngày bắt đầu / kết thúc kỳ hiện tại (dạng SQL expression -> date)
function configPeriodStart(periodType) {
  if (periodType === 'day') return VN_TODAY;
  if (periodType === 'week') return `date_trunc('week', ${VN_TODAY})::date`;
  return `date_trunc('month', ${VN_TODAY})::date`;
}
function configPeriodEnd(periodType) {
  if (periodType === 'day') return VN_TODAY;
  if (periodType === 'week') return `(date_trunc('week', ${VN_TODAY}) + interval '6 days')::date`;
  return `(date_trunc('month', ${VN_TODAY}) + interval '1 month' - interval '1 day')::date`;
}

// Tính số thực tế cho 1 metric của hệ configs
async function actualForConfig(metric, userId, range) {
  const { from, to } = range;
  switch (metric) {
    case 'calls': {
      const { rows } = await q(
        `SELECT COUNT(*)::int AS v FROM call_logs
         WHERE user_id = $1 AND called_at >= ${from} AND called_at < ${to}`,
        [userId]
      );
      return rows[0].v;
    }
    case 'leads_new': {
      const { rows } = await q(
        `SELECT COUNT(*)::int AS v FROM leads
         WHERE assigned_to = $1 AND created_at >= ${from} AND created_at < ${to}`,
        [userId]
      );
      return rows[0].v;
    }
    case 'viewings': {
      const { rows } = await q(
        `SELECT COUNT(*)::int AS v FROM follow_ups
         WHERE assigned_to = $1 AND type = 'hen_gap' AND status = 'done'
           AND done_at >= ${from} AND done_at < ${to}`,
        [userId]
      );
      return rows[0].v;
    }
    case 'holds': {
      const { rows } = await q(
        `SELECT COUNT(*)::int AS v FROM deals
         WHERE sale_id = $1 AND hold_at >= ${from} AND hold_at < ${to}`,
        [userId]
      );
      return rows[0].v;
    }
    case 'deposits': {
      const { rows } = await q(
        `SELECT COUNT(*)::int AS v FROM deals
         WHERE sale_id = $1 AND deposit_at IS NOT NULL
           AND deposit_at >= ${from} AND deposit_at < ${to}`,
        [userId]
      );
      return rows[0].v;
    }
    case 'deals_closed': {
      const { rows } = await q(
        `SELECT COUNT(*)::int AS v FROM deals
         WHERE sale_id = $1 AND status IN ('ky_hd', 'ban_giao')
           AND COALESCE(contract_at, created_at) >= ${from}
           AND COALESCE(contract_at, created_at) < ${to}`,
        [userId]
      );
      return rows[0].v;
    }
    case 'revenue': {
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

// Xếp hạng trạng thái snapshot theo % hoàn thành và ngưỡng cảnh báo
function snapshotStatus(achievementRate, warningThreshold) {
  if (achievementRate === null || achievementRate === undefined) return null;
  if (achievementRate >= 100) return 'dat';
  if (achievementRate >= Number(warningThreshold || 70)) return 'canh_bao';
  return 'nguy_hiem';
}

const STATUS_LABELS = { dat: 'Đạt', canh_bao: 'Cảnh báo', nguy_hiem: 'Nguy hiểm' };

// Lấy configs đang active áp dụng cho user hiện tại (ưu tiên cụ thể nhất trước)
async function applicableConfigs(workspaceId, userId, teamId, role) {
  const { rows } = await q(
    `SELECT c.*, u.full_name AS created_by_name
     FROM kpi_configs c
     LEFT JOIN users u ON u.id = c.created_by
     WHERE c.workspace_id = $1 AND c.is_active = true
       AND (c.team_id IS NULL OR c.team_id = $2)
       AND (c.role IS NULL OR c.role::text = $3)
     ORDER BY (CASE WHEN c.team_id IS NOT NULL THEN 2 ELSE 0 END
             + CASE WHEN c.role IS NOT NULL THEN 1 ELSE 0 END) DESC,
              c.period_type, c.metric`,
    [workspaceId, teamId, role]
  );
  // Dedupe theo (metric, period_type): giữ bản cụ thể nhất
  const seen = new Map();
  for (const c of rows) {
    const key = `${c.metric}|${c.period_type}`;
    if (!seen.has(key)) seen.set(key, c);
  }
  return [...seen.values()];
}

function mapConfig(r) {
  return {
    id: r.id,
    team_id: r.team_id,
    role: r.role,
    metric: r.metric,
    metric_label: CONFIG_METRIC_LABELS[r.metric] || r.metric,
    target_value: Number(r.target_value),
    period_type: r.period_type,
    period_label: CONFIG_PERIOD_LABELS[r.period_type] || r.period_type,
    warning_threshold: Number(r.warning_threshold),
    is_active: r.is_active,
    created_by: r.created_by,
    created_by_name: r.created_by_name || null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

// GET /kpis/configs — danh sách chỉ tiêu đang active áp dụng cho user
router.get('/configs', async (req, res) => {
  try {
    const configs = await applicableConfigs(
      req.user.workspace_id, req.user.id, req.user.team_id || null, req.user.role
    );
    res.json(configs.map(mapConfig));
  } catch (err) {
    console.error('[kpis:configs]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// POST /kpis/configs — tạo chỉ tiêu mới
router.post('/configs', async (req, res) => {
  const { metric, target_value, period_type = 'month', warning_threshold = 70, team_id = null, role = null } = req.body || {};
  if (!CONFIG_METRICS.includes(metric)) {
    return res.status(400).json({ error: `metric không hợp lệ: ${metric}`, valid_metrics: CONFIG_METRICS });
  }
  if (!CONFIG_PERIODS.includes(period_type)) {
    return res.status(400).json({ error: `period_type không hợp lệ: ${period_type}`, valid: CONFIG_PERIODS });
  }
  if (role !== null && !CONFIG_ROLES.includes(role)) {
    return res.status(400).json({ error: `role không hợp lệ: ${role}`, valid: CONFIG_ROLES });
  }
  if (target_value === undefined || Number(target_value) < 0 || Number.isNaN(Number(target_value))) {
    return res.status(400).json({ error: 'target_value phải là số >= 0' });
  }
  const wt = Number(warning_threshold);
  if (Number.isNaN(wt) || wt < 0 || wt > 100) {
    return res.status(400).json({ error: 'warning_threshold phải trong khoảng 0–100' });
  }
  try {
    const { rows } = await q(
      `INSERT INTO kpi_configs (workspace_id, team_id, role, metric, target_value, period_type, warning_threshold, created_by)
       VALUES ($1, $2, $3::kpi_config_role, $4::kpi_metric, $5, $6::kpi_period_type, $7, $8)
       RETURNING *`,
      [req.user.workspace_id, team_id, role, metric, Number(target_value), period_type, wt, req.user.id]
    );
    res.status(201).json(mapConfig(rows[0]));
  } catch (err) {
    console.error('[kpis:configs:create]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// PATCH /kpis/configs/:id — sửa chỉ tiêu
router.patch('/configs/:id', async (req, res) => {
  const allowed = ['metric', 'target_value', 'period_type', 'warning_threshold', 'team_id', 'role', 'is_active'];
  const sets = [];
  const vals = [];
  let i = 1;
  for (const key of allowed) {
    if (req.body[key] === undefined) continue;
    const v = req.body[key];
    if (key === 'metric' && !CONFIG_METRICS.includes(v)) {
      return res.status(400).json({ error: `metric không hợp lệ: ${v}` });
    }
    if (key === 'period_type' && !CONFIG_PERIODS.includes(v)) {
      return res.status(400).json({ error: `period_type không hợp lệ: ${v}` });
    }
    if (key === 'role' && v !== null && !CONFIG_ROLES.includes(v)) {
      return res.status(400).json({ error: `role không hợp lệ: ${v}` });
    }
    if (key === 'target_value' && (Number(v) < 0 || Number.isNaN(Number(v)))) {
      return res.status(400).json({ error: 'target_value phải là số >= 0' });
    }
    if (key === 'warning_threshold') {
      const wt = Number(v);
      if (Number.isNaN(wt) || wt < 0 || wt > 100) {
        return res.status(400).json({ error: 'warning_threshold phải trong khoảng 0–100' });
      }
    }
    const cast =
      key === 'metric' ? '::kpi_metric' :
      key === 'period_type' ? '::kpi_period_type' :
      key === 'role' ? '::kpi_config_role' : '';
    sets.push(`${key} = $${i}${cast}`);
    vals.push(v);
    i += 1;
  }
  if (sets.length === 0) {
    return res.status(400).json({ error: 'Không có trường nào để cập nhật' });
  }
  try {
    const { rows } = await q(
      `UPDATE kpi_configs SET ${sets.join(', ')}, updated_at = now()
       WHERE id = $${i} AND workspace_id = $${i + 1}
       RETURNING *`,
      [...vals, req.params.id, req.user.workspace_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy chỉ tiêu' });
    res.json(mapConfig(rows[0]));
  } catch (err) {
    console.error('[kpis:configs:patch]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// DELETE /kpis/configs/:id — xóa chỉ tiêu
router.delete('/configs/:id', async (req, res) => {
  try {
    const { rowCount } = await q(
      `DELETE FROM kpi_configs WHERE id = $1 AND workspace_id = $2`,
      [req.params.id, req.user.workspace_id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Không tìm thấy chỉ tiêu' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[kpis:configs:delete]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// POST /kpis/snapshot — chụp snapshot kỳ hiện tại cho user
router.post('/snapshot', async (req, res) => {
  try {
    const configs = await applicableConfigs(
      req.user.workspace_id, req.user.id, req.user.team_id || null, req.user.role
    );
    if (configs.length === 0) {
      return res.status(400).json({ error: 'Chưa có chỉ tiêu KPI nào đang áp dụng' });
    }
    const out = [];
    for (const c of configs) {
      const range = configPeriodRange(c.period_type);
      const actual = await actualForConfig(c.metric, req.user.id, range);
      const target = Number(c.target_value);
      const rate = target > 0 ? Math.round((Number(actual) / target) * 10000) / 100 : null;
      const status = snapshotStatus(rate, c.warning_threshold);
      const { rows } = await q(
        `INSERT INTO kpi_snapshots
           (workspace_id, user_id, team_id, kpi_config_id, metric, period_type,
            period_start, period_end, actual_value, target_value, achievement_rate, status)
         VALUES ($1, $2, $3, $4, $5::kpi_metric, $6::kpi_period_type,
                 ${configPeriodStart(c.period_type)}, ${configPeriodEnd(c.period_type)},
                 $7, $8, $9, $10::kpi_snapshot_status)
         ON CONFLICT (workspace_id, user_id, metric, period_type, period_start)
         DO UPDATE SET actual_value = EXCLUDED.actual_value,
                       target_value = EXCLUDED.target_value,
                       achievement_rate = EXCLUDED.achievement_rate,
                       status = EXCLUDED.status,
                       period_end = EXCLUDED.period_end,
                       kpi_config_id = EXCLUDED.kpi_config_id,
                       team_id = EXCLUDED.team_id
         RETURNING *`,
        [
          req.user.workspace_id, req.user.id, req.user.team_id || null, c.id,
          c.metric, c.period_type, Number(actual), target, rate, status,
        ]
      );
      const s = rows[0];
      out.push({
        id: s.id,
        metric: s.metric,
        metric_label: CONFIG_METRIC_LABELS[s.metric] || s.metric,
        period_type: s.period_type,
        period_start: s.period_start,
        period_end: s.period_end,
        actual_value: Number(s.actual_value),
        target_value: Number(s.target_value),
        achievement_rate: s.achievement_rate === null ? null : Number(s.achievement_rate),
        status: s.status,
        status_label: STATUS_LABELS[s.status] || null,
        created_at: s.created_at,
      });
    }
    res.status(201).json({ count: out.length, snapshots: out });
  } catch (err) {
    console.error('[kpis:snapshot]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// GET /kpis/history?metric=&period_type= — lịch sử snapshot để vẽ biểu đồ
router.get('/history', async (req, res) => {
  const { metric, period_type } = req.query;
  if (metric && !CONFIG_METRICS.includes(metric)) {
    return res.status(400).json({ error: `metric không hợp lệ: ${metric}` });
  }
  if (period_type && !CONFIG_PERIODS.includes(period_type)) {
    return res.status(400).json({ error: `period_type không hợp lệ: ${period_type}` });
  }
  try {
    const conds = [`workspace_id = $1`, `user_id = $2`];
    const vals = [req.user.workspace_id, req.user.id];
    let i = 3;
    if (metric) { conds.push(`metric = $${i}::kpi_metric`); vals.push(metric); i += 1; }
    if (period_type) { conds.push(`period_type = $${i}::kpi_period_type`); vals.push(period_type); i += 1; }
    const { rows } = await q(
      `SELECT id, metric, period_type, period_start, period_end,
              actual_value, target_value, achievement_rate, status, created_at
       FROM kpi_snapshots
       WHERE ${conds.join(' AND ')}
       ORDER BY period_start DESC
       LIMIT 60`,
      vals
    );
    res.json(rows.map((s) => ({
      id: s.id,
      metric: s.metric,
      metric_label: CONFIG_METRIC_LABELS[s.metric] || s.metric,
      period_type: s.period_type,
      period_start: s.period_start,
      period_end: s.period_end,
      actual_value: Number(s.actual_value),
      target_value: Number(s.target_value),
      achievement_rate: s.achievement_rate === null ? null : Number(s.achievement_rate),
      status: s.status,
      status_label: STATUS_LABELS[s.status] || null,
      created_at: s.created_at,
    })));
  } catch (err) {
    console.error('[kpis:history]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

export default router;
