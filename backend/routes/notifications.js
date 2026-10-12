import { Router } from 'express';
import { q } from '../db.js';
import { auth } from '../middleware/auth.js';

const router = Router();
router.use(auth);

router.get('/', async (req, res) => {
  try {
    const { is_read } = req.query;
    const params = [req.user.id];
    const conds = ['user_id = $1'];
    if (is_read === 'true' || is_read === 'false') {
      conds.push(`is_read = ${is_read === 'true'}`);
    }
    const { rows } = await q(
      `SELECT * FROM notifications WHERE ${conds.join(' AND ')} ORDER BY created_at DESC LIMIT 50`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error('[notifications:list]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

router.post('/:id/read', async (req, res) => {
  try {
    const { rows } = await q(
      'SELECT id FROM notifications WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Không tìm thấy thông báo' });
    await q('UPDATE notifications SET is_read = true WHERE id = $1', [rows[0].id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[notifications:read]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

export default router;
