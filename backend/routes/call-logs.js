import { Router } from 'express';
import { q } from '../db.js';
import { auth } from '../middleware/auth.js';
import { routeFor, callModel } from '../ai/modelRouter.js';

const router = Router();
router.use(auth);

const OUTCOMES = ['thanh_cong', 'khong_nghe_may', 'may_ban', 'tu_choi', 'hen_lai', 'sai_so'];

const OUTCOME_LABELS = {
  thanh_cong: 'Thành công',
  khong_nghe_may: 'Không nghe máy',
  may_ban: 'Máy bận',
  tu_choi: 'Từ chối',
  hen_lai: 'Hẹn lại',
  sai_so: 'Sai số',
};

function mapCallLog(row) {
  if (!row) return row;
  return {
    ...row,
    duration_min: row.duration_sec != null ? Math.round((row.duration_sec / 60) * 10) / 10 : 0,
    outcome_label: OUTCOME_LABELS[row.outcome] || row.outcome,
  };
}

// Danh sách nhật ký cuộc gọi (lọc theo lead / khoảng thời gian, phân trang đơn giản)
router.get('/', async (req, res) => {
  const { lead_id, from, to, page = 1, limit = 20 } = req.query;
  const conds = ['cl.user_id = $1', 'cl.workspace_id = $2'];
  const params = [req.user.id, req.user.workspace_id];
  if (lead_id) {
    params.push(lead_id);
    conds.push(`cl.lead_id = $${params.length}`);
  }
  if (from) {
    params.push(from);
    conds.push(`cl.called_at >= $${params.length}::timestamptz`);
  }
  if (to) {
    params.push(to);
    conds.push(`cl.called_at < ($${params.length}::timestamptz + interval '1 day')`);
  }
  const pg = Math.max(1, parseInt(page, 10) || 1);
  const lim = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (pg - 1) * lim;
  try {
    const total = await q(
      `SELECT COUNT(*)::int AS c FROM call_logs cl WHERE ${conds.join(' AND ')}`,
      params
    );
    const { rows } = await q(
      `SELECT cl.*, l.full_name AS lead_name, l.phone AS lead_phone
       FROM call_logs cl
       LEFT JOIN leads l ON l.id = cl.lead_id
       WHERE ${conds.join(' AND ')}
       ORDER BY cl.called_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, lim, offset]
    );
    res.json({
      data: rows.map(mapCallLog),
      pagination: { page: pg, limit: lim, total: total.rows[0].c },
    });
  } catch (err) {
    console.error('[call-logs:list]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// Thống kê cuộc gọi theo khoảng thời gian
router.get('/stats', async (req, res) => {
  const { from, to } = req.query;
  const conds = ['user_id = $1', 'workspace_id = $2'];
  const params = [req.user.id, req.user.workspace_id];
  if (from) {
    params.push(from);
    conds.push(`called_at >= $${params.length}::timestamptz`);
  }
  if (to) {
    params.push(to);
    conds.push(`called_at < ($${params.length}::timestamptz + interval '1 day')`);
  }
  try {
    const { rows } = await q(
      `SELECT
         COUNT(*)::int AS total_calls,
         COALESCE(SUM(duration_sec), 0)::int AS total_sec,
         COUNT(*) FILTER (WHERE outcome = 'thanh_cong')::int AS thanh_cong
       FROM call_logs WHERE ${conds.join(' AND ')}`,
      params
    );
    const byOutcome = await q(
      `SELECT outcome, COUNT(*)::int AS count,
              COALESCE(SUM(duration_sec), 0)::int AS total_sec
       FROM call_logs WHERE ${conds.join(' AND ')}
       GROUP BY outcome ORDER BY count DESC`,
      params
    );
    const s = rows[0];
    res.json({
      total_calls: s.total_calls,
      total_minutes: Math.round((s.total_sec / 60) * 10) / 10,
      thanh_cong: s.thanh_cong,
      ty_le_thanh_cong: s.total_calls > 0 ? Math.round((s.thanh_cong / s.total_calls) * 1000) / 10 : 0,
      by_outcome: byOutcome.rows.map((r) => ({
        ...r,
        label: OUTCOME_LABELS[r.outcome] || r.outcome,
      })),
    });
  } catch (err) {
    console.error('[call-logs:stats]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

/**
 * Chấm điểm cuộc gọi bằng AI (chạy nền sau khi tạo log).
 * Parse điểm 0-100 và tóm tắt 1 câu từ output model, rồi UPDATE vào DB.
 */
async function scoreCallAsync(callLogId, { outcome, duration_min, note }) {
  const route = routeFor('cham_diem_cuoc_goi');
  if (!route || !route.hasKey) return;
  const prompt =
    'Bạn là chuyên gia đào tạo sale bất động sản. ' +
    'Chấm điểm cuộc gọi dưới đây theo thang 0-100 ' +
    '(dựa trên kết quả, thời lượng và ghi chú), ' +
    'rồi tóm tắt đúng 1 câu ngắn gọn bằng tiếng Việt.\n' +
    'Trả về đúng 2 dòng:\n' +
    'DIEM: <số 0-100>\n' +
    'TOMTAT: <1 câu>\n\n' +
    `Kết quả: ${outcome}\n` +
    `Thời lượng: ${duration_min} phút\n` +
    `Ghi chú: ${note || '(không có)'}`;
  const aiRes = await callModel(route, [{ role: 'user', content: prompt }], { maxTokens: 256 });
  if (aiRes.mock || !aiRes.text) return;
  const scoreMatch = aiRes.text.match(/DIEM:\s*(\d{1,3})/i);
  const summaryMatch = aiRes.text.match(/TOMTAT:\s*(.+)/i);
  const score = scoreMatch ? Math.min(100, Math.max(0, parseInt(scoreMatch[1], 10))) : null;
  const summary = summaryMatch ? summaryMatch[1].trim().slice(0, 500) : null;
  if (score === null && !summary) return;
  await q(
    `UPDATE call_logs
     SET ai_score = COALESCE($2, ai_score), ai_summary = COALESCE($3, ai_summary)
     WHERE id = $1`,
    [callLogId, score, summary]
  );
  console.log(`[call-logs:ai-score] ${callLogId} → điểm ${score}`);
}

// Ghi nhật ký cuộc gọi mới
router.post('/', async (req, res) => {
  const { lead_id, duration_sec, outcome, note, recording_url, called_at } = req.body || {};
  const oc = OUTCOMES.includes(outcome) ? outcome : 'khong_nghe_may';
  try {
    // Nếu có lead_id, kiểm tra lead thuộc về user này
    if (lead_id) {
      const chk = await q(
        'SELECT id FROM leads WHERE id = $1 AND assigned_to = $2',
        [lead_id, req.user.id]
      );
      if (!chk.rows[0]) {
        return res.status(404).json({ error: 'Không tìm thấy lead' });
      }
    }
    const { rows } = await q(
      `INSERT INTO call_logs
         (workspace_id, lead_id, user_id, called_at, duration_sec, outcome, note, recording_url)
       VALUES ($1, $2, $3, COALESCE($4::timestamptz, now()), $5, $6, $7, $8)
       RETURNING *`,
      [
        req.user.workspace_id,
        lead_id || null,
        req.user.id,
        called_at || null,
        Math.max(0, parseInt(duration_sec, 10) || 0),
        oc,
        note || null,
        recording_url || null,
      ]
    );
    // Cập nhật last_contact_at của lead (nếu có)
    if (lead_id) {
      await q('UPDATE leads SET last_contact_at = now(), updated_at = now() WHERE id = $1', [lead_id]);
    }
    const created = mapCallLog(rows[0]);

    // AI chấm điểm cuộc gọi (bất đồng bộ, không block response)
    const scoreRoute = routeFor('cham_diem_cuoc_goi');
    if (scoreRoute && scoreRoute.hasKey) {
      setImmediate(() => {
        scoreCallAsync(created.id, {
          outcome: OUTCOME_LABELS[oc] || oc,
          duration_min: created.duration_min,
          note: note || '',
        }).catch((e) => console.error('[call-logs:ai-score]', e.message));
      });
    }

    res.status(201).json(created);
  } catch (err) {
    console.error('[call-logs:create]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

export default router;
