import { Router } from 'express';
import crypto from 'crypto';
import { q, tx, mapLead } from '../db.js';

const router = Router();

// Rate limit đơn giản trong RAM: 60 req/phút/key
const hits = new Map(); // keyHash -> [timestamps]
function rateOk(keyHash) {
  const now = Date.now();
  const arr = (hits.get(keyHash) || []).filter((t) => now - t < 60_000);
  if (arr.length >= 60) return false;
  arr.push(now);
  hits.set(keyHash, arr);
  return true;
}

const VN_PHONE = /^0\d{9}$/;
const LEAD_SOURCES = ['facebook', 'tiktok', 'referral', 'walk_in', 'website', 'data_mua', 'khac'];

// POST /public/leads — webhook nhận lead từ ứng dụng ngoài (không cần JWT)
router.post('/public/leads', async (req, res) => {
  const apiKey = req.get('X-API-Key');
  if (!apiKey) {
    return res.status(401).json({ error: 'Thiếu X-API-Key' });
  }
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
  let keyRow;
  try {
    const r = await q('SELECT * FROM api_keys WHERE key_hash = $1', [keyHash]);
    keyRow = r.rows[0];
  } catch (err) {
    console.error('[public-leads:key]', err.message);
    return res.status(500).json({ error: 'Lỗi máy chủ' });
  }
  if (!keyRow) return res.status(401).json({ error: 'API key không hợp lệ' });
  if (!keyRow.is_active) return res.status(403).json({ error: 'API key đã bị vô hiệu hóa' });
  if (!rateOk(keyHash)) {
    return res.status(429).json({ error: 'Quá nhiều yêu cầu, thử lại sau 1 phút' });
  }

  const { name, phone, email, source, note, project_id, custom_fields } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Thiếu tên khách hàng (name)' });
  }
  const digits = String(phone || '').replace(/[\s.\-]/g, '');
  if (!VN_PHONE.test(digits)) {
    return res.status(400).json({ error: 'Số điện thoại không hợp lệ (10 số, bắt đầu bằng 0)' });
  }
  const src = LEAD_SOURCES.includes(source) ? source : 'khac';

  try {
    const lead = await tx(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO leads (full_name, phone, source, demand, status, score, note)
         VALUES ($1, $2, $3, $4, 'moi', 0, $5) RETURNING *`,
        [
          String(name).trim(),
          digits,
          src,
          custom_fields ? JSON.stringify(custom_fields) : null,
          [`Nguồn: API ${keyRow.name}`, email ? `Email: ${email}` : null,
           project_id ? `Dự án: ${project_id}` : null, note || null]
            .filter(Boolean)
            .join(' | '),
        ]
      );
      await client.query(
        `INSERT INTO activities (lead_id, user_id, type, content) VALUES ($1, $2, 'ghi_chu', $3)`,
        [rows[0].id, keyRow.created_by, `Lead tự động từ API: ${keyRow.name}`]
      );
      await client.query(`UPDATE api_keys SET last_used_at = now() WHERE id = $1`, [keyRow.id]);
      return rows[0];
    });
    res.status(201).json({ ok: true, lead_id: lead.id });
  } catch (err) {
    console.error('[public-leads:create]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

export default router;
