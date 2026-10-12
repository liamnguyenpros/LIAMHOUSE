import { Router } from 'express';
import { q } from '../db.js';
import { auth } from '../middleware/auth.js';

const router = Router();
router.use(auth);

const SHARE_TYPES = ['lead', 'project', 'property'];

// Tạo link chia sẻ (Zalo) cho lead / dự án / căn hộ.
// GĐ này chỉ tạo deep link + text cho frontend vẽ QR, chưa gọi API Zalo thật.
router.post('/zalo', async (req, res) => {
  const { type, id } = req.body || {};
  if (!SHARE_TYPES.includes(type) || !id) {
    return res.status(400).json({ error: "Body cần {type: 'lead'|'project'|'property', id}" });
  }
  try {
    let title = '';
    if (type === 'lead') {
      const { rows } = await q(
        'SELECT full_name, phone FROM leads WHERE id = $1 AND assigned_to = $2',
        [id, req.user.id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Không tìm thấy lead' });
      title = `Khách hàng ${rows[0].full_name}`;
    } else if (type === 'project') {
      const { rows } = await q('SELECT name FROM projects WHERE id = $1', [id]);
      if (!rows[0]) return res.status(404).json({ error: 'Không tìm thấy dự án' });
      title = `Dự án ${rows[0].name}`;
    } else {
      const { rows } = await q(
        `SELECT p.code, pr.name AS project_name FROM properties p
         LEFT JOIN projects pr ON pr.id = p.project_id
         WHERE p.id = $1`,
        [id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Không tìm thấy căn hộ' });
      title = `Căn ${rows[0].code}${rows[0].project_name ? ` — ${rows[0].project_name}` : ''}`;
    }

    const base = (process.env.FRONTEND_URL || '').replace(/\/+$/, '');
    const share_url = `${base}/#/${type}/${id}`;
    // qr_data: text để frontend vẽ QR (mặc định chính là share_url)
    const qr_data = share_url;
    // message gợi ý để user copy-paste gửi qua Zalo
    const message = `${title}\nXem chi tiết: ${share_url || '(mở app LIAMHOUSE)'}`;

    res.json({ type, id, title, share_url, qr_data, message });
  } catch (err) {
    console.error('[share:zalo]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

export default router;
