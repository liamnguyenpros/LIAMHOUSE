import { Router } from 'express';
import { q, tx, VN_TODAY } from '../db.js';
import { auth } from '../middleware/auth.js';

const router = Router();
router.use(auth);

// filter: today | overdue | upcoming ; thêm lead_id, status để lọc chi tiết
router.get('/', async (req, res) => {
  const { filter, lead_id, status } = req.query;
  const uid = req.user.id;
  const params = [uid];
  const conds = ['f.assigned_to = $1'];
  if (status) {
    params.push(status);
    conds.push(`f.status = $${params.length}`);
  } else {
    conds.push(`f.status = 'pending'`);
  }
  if (lead_id) {
    params.push(lead_id);
    conds.push(`f.lead_id = $${params.length}`);
  }
  if (filter === 'today') conds.push(`f.due_at::date = ${VN_TODAY}`);
  else if (filter === 'overdue') conds.push(`f.due_at::date < ${VN_TODAY}`);
  else if (filter === 'upcoming') conds.push(`f.due_at::date > ${VN_TODAY}`);
  try {
    const { rows } = await q(
      `SELECT f.*, l.full_name AS lead_name, l.phone AS lead_phone
       FROM follow_ups f JOIN leads l ON l.id = f.lead_id
       WHERE ${conds.join(' AND ')} ORDER BY f.due_at ASC`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error('[followups:list]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

router.post('/', async (req, res) => {
  const { lead_id, title, due_at, note } = req.body || {};
  if (!lead_id || !title || !due_at) {
    return res.status(400).json({ error: 'Vui lòng nhập tiêu đề và thời gian' });
  }
  try {
    const chk = await q('SELECT id FROM leads WHERE id = $1 AND assigned_to = $2', [lead_id, req.user.id]);
    if (!chk.rows[0]) return res.status(404).json({ error: 'Không tìm thấy lead' });
    const { rows } = await q(
      `INSERT INTO follow_ups (lead_id, assigned_to, title, due_at, note, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING *`,
      [lead_id, req.user.id, title, due_at, note || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[followups:create]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// Sửa lịch chăm sóc (tiêu đề, thời gian, ghi chú, trạng thái)
router.patch('/:id', async (req, res) => {
  const { title, due_at, note, status } = req.body || {};
  const VALID_STATUS = ['pending', 'done', 'overdue', 'skipped'];
  try {
    const chk = await q(
      'SELECT * FROM follow_ups WHERE id = $1 AND assigned_to = $2',
      [req.params.id, req.user.id]
    );
    if (!chk.rows[0]) return res.status(404).json({ error: 'Không tìm thấy lịch' });
    if (status && !VALID_STATUS.includes(status)) {
      return res.status(400).json({ error: 'Trạng thái không hợp lệ' });
    }
    const sets = [];
    const params = [];
    if (title !== undefined) { params.push(title); sets.push(`title = $${params.length}`); }
    if (due_at !== undefined) { params.push(due_at); sets.push(`due_at = $${params.length}`); }
    if (note !== undefined) { params.push(note); sets.push(`note = $${params.length}`); }
    if (status) {
      params.push(status);
      sets.push(`status = $${params.length}`);
      if (status === 'done') sets.push(`done_at = now()`);
    }
    if (!sets.length) return res.status(400).json({ error: 'Không có gì để cập nhật' });
    params.push(req.params.id);
    const { rows } = await q(
      `UPDATE follow_ups SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('[followups:patch]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

router.post('/:id/complete', async (req, res) => {  try {
    const done = await tx(async (client) => {
      const { rows } = await client.query(
        'SELECT * FROM follow_ups WHERE id = $1 AND assigned_to = $2',
        [req.params.id, req.user.id]
      );
      const fu = rows[0];
      if (!fu) return null;
      await client.query(`UPDATE follow_ups SET status = 'done', done_at = now() WHERE id = $1`, [fu.id]);
      await client.query(
        `INSERT INTO activities (lead_id, user_id, type, content) VALUES ($1, $2, 'ghi_chu', $3)`,
        [fu.lead_id, req.user.id, `Hoàn thành chăm sóc: ${fu.title}`]
      );
      return true;
    });
    if (!done) return res.status(404).json({ error: 'Không tìm thấy lịch' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[followups:complete]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

export default router;
