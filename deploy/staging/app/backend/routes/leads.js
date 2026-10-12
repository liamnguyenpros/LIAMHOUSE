import { Router } from 'express';
import { q, tx, mapLead } from '../db.js';
import { auth } from '../middleware/auth.js';

const router = Router();
router.use(auth);

export const STAGES = ['moi', 'da_lien_he', 'dang_tu_van', 'da_dan_xem', 'dat_coc', 'ky_hd', 'ban_giao'];
export const STAGE_LABELS = {
  moi: 'Mới',
  da_lien_he: 'Đã liên hệ',
  dang_tu_van: 'Đang tư vấn',
  da_dan_xem: 'Đã dẫn xem',
  dat_coc: 'Đặt cọc',
  ky_hd: 'Ký HĐ',
  ban_giao: 'Bàn giao',
  mat: 'Mất',
};

const LEAD_SOURCES = ['facebook', 'tiktok', 'referral', 'walk_in', 'website', 'data_mua', 'khac'];

// Danh sách lead (tìm kiếm + lọc theo bước) — sale chỉ thấy lead được gán cho mình
router.get('/', async (req, res) => {
  const { status, q: keyword } = req.query;
  const conds = ['assigned_to = $1'];
  const params = [req.user.id];
  if (status) {
    params.push(status);
    conds.push(`status = $${params.length}`);
  }
  if (keyword) {
    params.push(`%${keyword}%`, `%${keyword}%`);
    conds.push(`(full_name ILIKE $${params.length - 1} OR phone ILIKE $${params.length})`);
  }
  try {
    const { rows } = await q(
      `SELECT * FROM leads WHERE ${conds.join(' AND ')} ORDER BY updated_at DESC`,
      params
    );
    res.json(rows.map(mapLead));
  } catch (err) {
    console.error('[leads:list]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// Tạo lead
router.post('/', async (req, res) => {
  const { full_name, phone, zalo, source, demand, score } = req.body || {};
  if (!full_name || !phone) {
    return res.status(400).json({ error: 'Vui lòng nhập họ tên và số điện thoại' });
  }
  const src = LEAD_SOURCES.includes(source) ? source : 'khac';
  try {
    const lead = await tx(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO leads (full_name, phone, zalo, source, demand, status, score, assigned_to)
         VALUES ($1, $2, $3, $4, $5, 'moi', $6, $7)
         RETURNING *`,
        [full_name, phone, zalo || null, src,
          demand ? JSON.stringify(demand) : null,
          Number(score) || 0, req.user.id]
      );
      await client.query(
        `INSERT INTO activities (lead_id, user_id, type, content) VALUES ($1, $2, 'ghi_chu', $3)`,
        [rows[0].id, req.user.id, 'Tạo lead mới']
      );
      return rows[0];
    });
    res.status(201).json(mapLead(lead));
  } catch (err) {
    console.error('[leads:create]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// Chi tiết lead kèm follow-ups, activities, deals
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await q(
      'SELECT * FROM leads WHERE id = $1 AND assigned_to = $2',
      [req.params.id, req.user.id]
    );
    const lead = rows[0];
    if (!lead) return res.status(404).json({ error: 'Không tìm thấy lead' });
    const fus = await q('SELECT * FROM follow_ups WHERE lead_id = $1 ORDER BY due_at ASC', [lead.id]);
    const acts = await q('SELECT * FROM activities WHERE lead_id = $1 ORDER BY created_at DESC', [lead.id]);
    const deals = await q(
      `SELECT d.*, p.code AS property_code FROM deals d
       LEFT JOIN properties p ON p.id = d.property_id
       WHERE d.lead_id = $1 ORDER BY d.created_at DESC`,
      [lead.id]
    );
    res.json({
      ...mapLead(lead),
      follow_ups: fus.rows,
      activities: acts.rows,
      deals: deals.rows,
    });
  } catch (err) {
    console.error('[leads:detail]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// Cập nhật lead
router.patch('/:id', async (req, res) => {
  const { full_name, phone, zalo, source, demand, score } = req.body || {};
  try {
    const { rows } = await q(
      `UPDATE leads SET
         full_name = COALESCE($1, full_name),
         phone = COALESCE($2, phone),
         zalo = COALESCE($3, zalo),
         source = COALESCE($4, source),
         demand = COALESCE($5, demand),
         score = COALESCE($6, score),
         updated_at = now()
       WHERE id = $7 AND assigned_to = $8
       RETURNING *`,
      [
        full_name || null, phone || null, zalo || null,
        source && LEAD_SOURCES.includes(source) ? source : null,
        demand ? JSON.stringify(demand) : null,
        score !== undefined ? Number(score) : null,
        req.params.id, req.user.id,
      ]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Không tìm thấy lead' });
    res.json(mapLead(rows[0]));
  } catch (err) {
    console.error('[leads:update]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// Chuyển bước pipeline + tự ghi activity
router.patch('/:id/stage', async (req, res) => {
  const { status } = req.body || {};
  const valid = [...STAGES, 'mat'];
  if (!valid.includes(status)) {
    return res.status(400).json({ error: 'Trạng thái không hợp lệ' });
  }
  try {
    const lead = await tx(async (client) => {
      const { rows } = await client.query(
        'UPDATE leads SET status = $1, updated_at = now() WHERE id = $2 AND assigned_to = $3 RETURNING *',
        [status, req.params.id, req.user.id]
      );
      if (!rows[0]) return null;
      await client.query(
        `INSERT INTO activities (lead_id, user_id, type, content) VALUES ($1, $2, 'doi_trang_thai', $3)`,
        [rows[0].id, req.user.id, `Chuyển sang bước: ${STAGE_LABELS[status]}`]
      );
      return rows[0];
    });
    if (!lead) return res.status(404).json({ error: 'Không tìm thấy lead' });
    res.json(mapLead(lead));
  } catch (err) {
    console.error('[leads:stage]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// PUT /leads/:id/demand — cập nhật nhu cầu khách hàng (phục vụ khớp nhu cầu tự động)
router.put('/:id/demand', async (req, res) => {
  const demand = req.body || {};
  const allowed = ['loai', 'khu_vuc', 'ngan_sach_min', 'ngan_sach_max', 'dien_tich_min', 'dien_tich_max', 'muc_dich', 'ghi_chu'];
  const clean = {};
  for (const k of allowed) {
    if (demand[k] !== undefined) clean[k] = demand[k];
  }
  try {
    const { rows } = await q(
      `UPDATE leads SET demand = $1, updated_at = now()
       WHERE id = $2 AND assigned_to = $3
       RETURNING *`,
      [JSON.stringify(clean), req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Không tìm thấy lead' });
    res.json(mapLead(rows[0]));
  } catch (err) {
    console.error('[leads:demand]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

export default router;
