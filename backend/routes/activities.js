import { Router } from 'express';
import { q } from '../db.js';
import { auth } from '../middleware/auth.js';

const router = Router();
router.use(auth);

const TYPES = ['goi_dien', 'gap_mat', 'zalo', 'ghi_chu', 'doi_trang_thai'];

router.post('/', async (req, res) => {
  const { lead_id, type, content } = req.body || {};
  if (!lead_id || !type || !content) {
    return res.status(400).json({ error: 'Vui lòng nhập đầy đủ thông tin' });
  }
  if (!TYPES.includes(type)) return res.status(400).json({ error: 'Loại hoạt động không hợp lệ' });
  try {
    const chk = await q('SELECT id FROM leads WHERE id = $1 AND assigned_to = $2', [lead_id, req.user.id]);
    if (!chk.rows[0]) return res.status(404).json({ error: 'Không tìm thấy lead' });
    const { rows } = await q(
      `INSERT INTO activities (lead_id, user_id, type, content) VALUES ($1, $2, $3, $4) RETURNING *`,
      [lead_id, req.user.id, type, content]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[activities:create]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

router.get('/lead/:leadId', async (req, res) => {
  try {
    const chk = await q('SELECT id FROM leads WHERE id = $1 AND assigned_to = $2', [req.params.leadId, req.user.id]);
    if (!chk.rows[0]) return res.status(404).json({ error: 'Không tìm thấy lead' });
    const { rows } = await q(
      'SELECT * FROM activities WHERE lead_id = $1 ORDER BY created_at DESC',
      [req.params.leadId]
    );
    res.json(rows);
  } catch (err) {
    console.error('[activities:list]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

export default router;
