import { Router } from 'express';
import { q } from '../db.js';
import { auth } from '../middleware/auth.js';

const router = Router();
router.use(auth);

const STATUS_LABELS = {
  draft: 'Nháp',
  running: 'Đang chạy',
  done: 'Hoàn thành',
  cancelled: 'Đã hủy',
};

// draft → running → done / cancelled
const ALLOWED_TRANSITIONS = {
  draft: ['running', 'cancelled'],
  running: ['done', 'cancelled'],
  done: [],
  cancelled: [],
};

function mapCampaign(row) {
  if (!row) return row;
  return {
    ...row,
    status_label: STATUS_LABELS[row.status] || row.status,
  };
}

/**
 * Áp dụng lead_filter đơn giản vào truy vấn leads.
 * Hỗ trợ: { status, created_before } — status có thể là string hoặc mảng.
 * Trả về { conds, params } để ghép vào WHERE.
 */
function applyLeadFilter(filter = {}, startIdx = 1) {
  const conds = [];
  const params = [];
  let idx = startIdx;
  if (filter.status) {
    const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
    if (statuses.length > 0) {
      params.push(statuses);
      conds.push(`l.status::text = ANY($${idx}::text[])`);
      idx += 1;
    }
  }
  if (filter.created_before) {
    params.push(filter.created_before);
    conds.push(`l.created_at < $${idx}::timestamptz`);
    idx += 1;
  }
  return { conds, params };
}

// GET /call-campaigns — danh sách (kèm số lead khớp filter)
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    const params = [req.user.workspace_id];
    const conds = ['c.workspace_id = $1'];
    if (status) {
      if (!STATUS_LABELS[status]) {
        return res.status(400).json({ error: 'Trạng thái không hợp lệ' });
      }
      params.push(status);
      conds.push(`c.status = $${params.length}`);
    }
    const { rows } = await q(
      `SELECT c.*, u.full_name AS created_by_name,
              a.full_name AS assigned_to_name
       FROM call_campaigns c
       LEFT JOIN users u ON u.id = c.created_by
       LEFT JOIN users a ON a.id = c.assigned_to
       WHERE ${conds.join(' AND ')}
       ORDER BY c.created_at DESC`,
      params
    );
    // Đếm số lead khớp filter cho từng chiến dịch
    const mapped = [];
    for (const row of rows) {
      let leadCount = 0;
      try {
        const { conds: fConds, params: fParams } = applyLeadFilter(row.lead_filter || {}, 1);
        const where = fConds.length > 0 ? `WHERE ${fConds.join(' AND ')}` : '';
        const cnt = await q(`SELECT COUNT(*)::int AS n FROM leads l ${where}`, fParams);
        leadCount = cnt.rows[0]?.n ?? 0;
      } catch {
        leadCount = 0;
      }
      mapped.push({ ...mapCampaign(row), lead_count: leadCount });
    }
    res.json(mapped);
  } catch (err) {
    console.error('[call-campaigns:list]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// POST /call-campaigns — tạo chiến dịch
router.post('/', async (req, res) => {
  try {
    const { name, lead_filter, assigned_to, schedule_at, team_id } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Thiếu tên chiến dịch' });
    }
    const filter = lead_filter && typeof lead_filter === 'object' ? lead_filter : {};
    const { rows } = await q(
      `INSERT INTO call_campaigns (workspace_id, team_id, name, created_by, lead_filter, assigned_to, schedule_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        req.user.workspace_id,
        team_id || null,
        String(name).trim(),
        req.user.id,
        JSON.stringify(filter),
        assigned_to || null,
        schedule_at || null,
      ]
    );
    res.status(201).json(mapCampaign(rows[0]));
  } catch (err) {
    console.error('[call-campaigns:create]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// GET /call-campaigns/:id/leads — preview lead khớp filter (tối đa 50)
router.get('/:id/leads', async (req, res) => {
  try {
    const { rows } = await q(
      `SELECT * FROM call_campaigns WHERE id = $1 AND workspace_id = $2`,
      [req.params.id, req.user.workspace_id]
    );
    const campaign = rows[0];
    if (!campaign) return res.status(404).json({ error: 'Không tìm thấy chiến dịch' });
    const { conds, params } = applyLeadFilter(campaign.lead_filter || {}, 1);
    const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
    const leads = await q(
      `SELECT l.id, l.full_name, l.phone, l.status, l.score, l.last_contact_at, l.created_at
       FROM leads l ${where}
       ORDER BY l.created_at DESC
       LIMIT 50`,
      params
    );
    res.json({ campaign_id: campaign.id, filter: campaign.lead_filter, total_preview: leads.rows.length, leads: leads.rows });
  } catch (err) {
    console.error('[call-campaigns:preview]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// PATCH /call-campaigns/:id/status — chuyển trạng thái
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!STATUS_LABELS[status]) {
      return res.status(400).json({ error: 'Trạng thái không hợp lệ' });
    }
    const { rows } = await q(
      `SELECT * FROM call_campaigns WHERE id = $1 AND workspace_id = $2`,
      [req.params.id, req.user.workspace_id]
    );
    const campaign = rows[0];
    if (!campaign) return res.status(404).json({ error: 'Không tìm thấy chiến dịch' });
    const allowed = ALLOWED_TRANSITIONS[campaign.status] || [];
    if (!allowed.includes(status)) {
      return res.status(400).json({
        error: `Không thể chuyển từ "${STATUS_LABELS[campaign.status]}" sang "${STATUS_LABELS[status]}"`,
        hint: `Cho phép: ${allowed.map((s) => STATUS_LABELS[s]).join(', ') || 'không có'}`,
      });
    }
    const upd = await q(
      `UPDATE call_campaigns SET status = $1 WHERE id = $2 RETURNING *`,
      [status, req.params.id]
    );
    res.json(mapCampaign(upd.rows[0]));
  } catch (err) {
    console.error('[call-campaigns:status]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// DELETE /call-campaigns/:id — chỉ khi draft
router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await q(
      `SELECT * FROM call_campaigns WHERE id = $1 AND workspace_id = $2`,
      [req.params.id, req.user.workspace_id]
    );
    const campaign = rows[0];
    if (!campaign) return res.status(404).json({ error: 'Không tìm thấy chiến dịch' });
    if (campaign.status !== 'draft') {
      return res.status(400).json({ error: 'Chỉ được xóa chiến dịch ở trạng thái Nháp' });
    }
    await q(`DELETE FROM call_campaigns WHERE id = $1`, [req.params.id]);
    res.json({ ok: true, deleted: req.params.id });
  } catch (err) {
    console.error('[call-campaigns:delete]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

export default router;
