import { Router } from 'express';
import { q } from '../db.js';
import { auth } from '../middleware/auth.js';

const router = Router();
router.use(auth);

// NOTE: mã hóa demo bằng base64 + prefix. Production nên dùng AES-256-GCM với key từ KMS/Vault.
const ENC_PREFIX = 'enc1:';

function encryptKey(raw) {
  return ENC_PREFIX + Buffer.from(String(raw), 'utf8').toString('base64');
}

function decryptKey(enc) {
  if (!enc || !String(enc).startsWith(ENC_PREFIX)) return null;
  try {
    return Buffer.from(String(enc).slice(ENC_PREFIX.length), 'base64').toString('utf8');
  } catch {
    return null;
  }
}

/** Mask API key để trả về client: "sk-****1234" (giữ 4 ký tự cuối). */
function maskKey(raw) {
  if (!raw) return '****';
  const s = String(raw);
  if (s.length <= 8) return '****';
  return s.slice(0, 2) + '-****' + s.slice(-4);
}

const PROVIDERS = ['stringee', 'vht', 'custom'];

function mapIntegration(row) {
  if (!row) return row;
  const raw = decryptKey(row.api_key_encrypted);
  const { api_key_encrypted, ...rest } = row;
  return { ...rest, api_key_masked: maskKey(raw) };
}

// GET /integrations — danh sách (api_key chỉ masked)
router.get('/', async (req, res) => {
  try {
    const { rows } = await q(
      `SELECT i.*, u.full_name AS created_by_name
       FROM workspace_integrations i
       LEFT JOIN users u ON u.id = i.created_by
       WHERE i.workspace_id = $1
       ORDER BY i.created_at DESC`,
      [req.user.workspace_id]
    );
    res.json(rows.map(mapIntegration));
  } catch (err) {
    console.error('[integrations:list]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// POST /integrations — tạo {provider, api_key, settings}
router.post('/', async (req, res) => {
  try {
    const { provider, api_key, settings } = req.body || {};
    if (!provider || !PROVIDERS.includes(provider)) {
      return res.status(400).json({
        error: 'Provider không hợp lệ',
        hint: `Chọn một trong: ${PROVIDERS.join(', ')}`,
      });
    }
    if (!api_key || !String(api_key).trim()) {
      return res.status(400).json({ error: 'Thiếu api_key' });
    }
    const { rows } = await q(
      `INSERT INTO workspace_integrations (workspace_id, provider, api_key_encrypted, settings, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        req.user.workspace_id,
        provider,
        encryptKey(api_key),
        JSON.stringify(settings && typeof settings === 'object' ? settings : {}),
        req.user.id,
      ]
    );
    res.status(201).json(mapIntegration(rows[0]));
  } catch (err) {
    console.error('[integrations:create]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// PATCH /integrations/:id — sửa is_active / settings / rotate api_key
router.patch('/:id', async (req, res) => {
  try {
    const { is_active, settings, api_key } = req.body || {};
    const { rows } = await q(
      `SELECT * FROM workspace_integrations WHERE id = $1 AND workspace_id = $2`,
      [req.params.id, req.user.workspace_id]
    );
    const integ = rows[0];
    if (!integ) return res.status(404).json({ error: 'Không tìm thấy tích hợp' });

    const sets = [];
    const params = [];
    if (typeof is_active === 'boolean') {
      params.push(is_active);
      sets.push(`is_active = $${params.length}`);
    }
    if (settings && typeof settings === 'object') {
      params.push(JSON.stringify(settings));
      sets.push(`settings = $${params.length}`);
    }
    if (api_key && String(api_key).trim()) {
      params.push(encryptKey(api_key));
      sets.push(`api_key_encrypted = $${params.length}`);
    }
    if (sets.length === 0) {
      return res.status(400).json({ error: 'Không có gì để cập nhật', hint: 'Gửi is_active, settings hoặc api_key' });
    }
    params.push(req.params.id);
    const upd = await q(
      `UPDATE workspace_integrations SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    res.json(mapIntegration(upd.rows[0]));
  } catch (err) {
    console.error('[integrations:update]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// DELETE /integrations/:id
router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await q(
      `DELETE FROM workspace_integrations WHERE id = $1 AND workspace_id = $2 RETURNING id`,
      [req.params.id, req.user.workspace_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy tích hợp' });
    res.json({ ok: true, deleted: req.params.id });
  } catch (err) {
    console.error('[integrations:delete]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

export default router;
