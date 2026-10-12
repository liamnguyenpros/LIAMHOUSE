import { Router } from 'express';
import crypto from 'crypto';
import { q } from '../db.js';
import { auth } from '../middleware/auth.js';

const router = Router();
router.use(auth);

function newKey() {
  const raw = 'lhpak_' + crypto.randomBytes(24).toString('hex'); // 48 ký tự hex
  return {
    raw,
    hash: crypto.createHash('sha256').update(raw).digest('hex'),
    prefix: raw.slice(0, 8),
  };
}

// Danh sách keys (chỉ hiện prefix, không bao giờ trả key đầy đủ)
router.get('/', async (req, res) => {
  try {
    const { rows } = await q(
      `SELECT id, workspace_id, name, key_prefix, is_active, last_used_at, created_at
       FROM api_keys WHERE workspace_id = $1 ORDER BY created_at DESC`,
      [req.user.workspace_id]
    );
    res.json(rows);
  } catch (err) {
    console.error('[api-keys:list]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// Tạo key mới — key đầy đủ CHỈ hiện 1 lần duy nhất tại đây
router.post('/', async (req, res) => {
  const { name } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Vui lòng đặt tên cho key (VD: Facebook Ads)' });
  }
  try {
    const k = newKey();
    const { rows } = await q(
      `INSERT INTO api_keys (workspace_id, name, key_hash, key_prefix, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, key_prefix, is_active, created_at`,
      [req.user.workspace_id, String(name).trim(), k.hash, k.prefix, req.user.id]
    );
    res.status(201).json({ ...rows[0], api_key: k.raw, warning: 'Lưu key này ngay — hệ thống không hiển thị lại lần nào nữa' });
  } catch (err) {
    console.error('[api-keys:create]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// Bật/tắt key
router.patch('/:id', async (req, res) => {
  const { is_active } = req.body || {};
  try {
    const { rows } = await q(
      `UPDATE api_keys SET is_active = $1 WHERE id = $2 AND workspace_id = $3
       RETURNING id, name, key_prefix, is_active, last_used_at, created_at`,
      [!!is_active, req.params.id, req.user.workspace_id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Không tìm thấy key' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[api-keys:toggle]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// Xóa key
router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await q(
      'DELETE FROM api_keys WHERE id = $1 AND workspace_id = $2 RETURNING id',
      [req.params.id, req.user.workspace_id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Không tìm thấy key' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[api-keys:delete]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

export default router;
