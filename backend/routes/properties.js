import { Router } from 'express';
import { q, mapProperty } from '../db.js';
import { auth } from '../middleware/auth.js';

const router = Router();
router.use(auth);

// Enum values từ DB (schema-v1.sql §3.7)
const VALID_TYPES = ['can_ho', 'shophouse', 'dat_nen', 'nha_pho', 'biet_thu'];
const VALID_STATUSES = ['trong', 'giu_cho', 'da_coc', 'da_ban'];
// Frontend gửi 'dang_ban' (API display) — map về DB value 'trong'
const STATUS_FROM_API = { dang_ban: 'trong', trong: 'trong', giu_cho: 'giu_cho', da_coc: 'da_coc', da_ban: 'da_ban' };
// Deal đang active (chưa hủy) — dùng để chặn đổi status về 'trong' và chặn xóa
const ACTIVE_DEAL_STATUSES = ['giu_cho', 'dat_coc', 'ky_hd', 'ban_giao'];

function normStatus(s) {
  if (s === undefined || s === null || s === '') return undefined;
  return STATUS_FROM_API[String(s).trim()] || null; // null = giá trị không hợp lệ
}

function numOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined; // undefined = không hợp lệ
}

// GET /properties?project_id= — danh sách sản phẩm (kèm tên dự án)
router.get('/', async (req, res) => {
  try {
    const { project_id, status } = req.query;
    const params = [];
    const conds = [];
    if (project_id) {
      params.push(project_id);
      conds.push(`p.project_id = $${params.length}`);
    }
    const dbStatus = status ? normStatus(status) : undefined;
    if (status && dbStatus === null) {
      return res.status(400).json({ error: 'Trạng thái không hợp lệ' });
    }
    if (dbStatus) {
      params.push(dbStatus);
      conds.push(`p.status = $${params.length}`);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const { rows } = await q(
      `SELECT p.*, pr.name AS project_name
       FROM properties p
       LEFT JOIN projects pr ON pr.id = p.project_id
       ${where}
       ORDER BY p.floor NULLS LAST, p.code`,
      params
    );
    res.json(rows.map(mapProperty));
  } catch (err) {
    console.error('[properties:list]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// GET /properties/:id — chi tiết 1 sản phẩm
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await q(
      `SELECT p.*, pr.name AS project_name
       FROM properties p
       LEFT JOIN projects pr ON pr.id = p.project_id
       WHERE p.id = $1`,
      [req.params.id]
    );
    const prop = rows[0];
    if (!prop) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
    const deals = await q(
      `SELECT id, status, lead_id, queue_priority FROM deals
       WHERE property_id = $1 ORDER BY queue_priority NULLS LAST, created_at DESC`,
      [prop.id]
    );
    res.json({ ...mapProperty(prop), deals: deals.rows });
  } catch (err) {
    console.error('[properties:detail]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// POST /properties — tạo sản phẩm mới
router.post('/', async (req, res) => {
  const { project_id, code, type, area, bedrooms, direction, floor, price, status, quantity, images } = req.body || {};

  if (!project_id) return res.status(400).json({ error: 'Vui lòng chọn dự án' });
  if (!code || !String(code).trim()) return res.status(400).json({ error: 'Vui lòng nhập mã căn' });
  if (!VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: `Loại sản phẩm không hợp lệ (${VALID_TYPES.join(', ')})` });
  }
  const priceNum = numOrNull(price);
  if (priceNum === undefined || priceNum === null || priceNum <= 0) {
    return res.status(400).json({ error: 'Giá bán phải lớn hơn 0' });
  }
  const dbStatus = normStatus(status) || 'trong';
  if (status && normStatus(status) === null) {
    return res.status(400).json({ error: 'Trạng thái không hợp lệ' });
  }

  try {
    // project_id phải tồn tại
    const pj = await q('SELECT id FROM projects WHERE id = $1', [project_id]);
    if (!pj.rows[0]) return res.status(400).json({ error: 'Dự án không tồn tại' });

    // code chưa trùng
    const dup = await q('SELECT id FROM properties WHERE code = $1', [String(code).trim()]);
    if (dup.rows[0]) return res.status(400).json({ error: `Mã căn "${String(code).trim()}" đã tồn tại` });

    const areaNum = numOrNull(area);
    if (area !== undefined && area !== null && area !== '' && areaNum === undefined) {
      return res.status(400).json({ error: 'Diện tích không hợp lệ' });
    }
    const floorNum = floor === undefined || floor === null || floor === '' ? null : parseInt(floor, 10);
    if (floorNum !== null && !Number.isInteger(floorNum)) {
      return res.status(400).json({ error: 'Tầng không hợp lệ' });
    }
    const bedNum = bedrooms === undefined || bedrooms === null || bedrooms === '' ? null : parseInt(bedrooms, 10);
    if (bedNum !== null && (!Number.isInteger(bedNum) || bedNum < 0)) {
      return res.status(400).json({ error: 'Số phòng ngủ không hợp lệ' });
    }
    const qtyNum = quantity === undefined || quantity === null || quantity === '' ? 1 : parseInt(quantity, 10);
    if (!Number.isInteger(qtyNum) || qtyNum < 1) {
      return res.status(400).json({ error: 'Số lượng phải là số nguyên ≥ 1' });
    }

    const { rows } = await q(
      `INSERT INTO properties (project_id, code, type, area, bedrooms, direction, floor, price, status, quantity, images)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [project_id, String(code).trim(), type, areaNum,
       bedNum, direction ? String(direction).trim() : null, floorNum, priceNum, dbStatus, qtyNum,
       images !== undefined ? images : null]
    );
    res.status(201).json(mapProperty(rows[0]));
  } catch (err) {
    console.error('[properties:create]', err.message);
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Mã căn đã tồn tại' });
    }
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// PATCH /properties/:id — sửa chi tiết sản phẩm
router.patch('/:id', async (req, res) => {
  try {
    const { rows } = await q('SELECT * FROM properties WHERE id = $1', [req.params.id]);
    const prop = rows[0];
    if (!prop) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });

    const b = req.body || {};
    const updates = {};
    const setClauses = [];
    const params = [];

    // project_id: phải tồn tại
    if (b.project_id !== undefined) {
      const pj = await q('SELECT id FROM projects WHERE id = $1', [b.project_id]);
      if (!pj.rows[0]) return res.status(400).json({ error: 'Dự án không tồn tại' });
      updates.project_id = b.project_id;
    }
    // code: không rỗng, không trùng
    if (b.code !== undefined) {
      const c = String(b.code).trim();
      if (!c) return res.status(400).json({ error: 'Mã căn không được rỗng' });
      const dup = await q('SELECT id FROM properties WHERE code = $1 AND id <> $2', [c, prop.id]);
      if (dup.rows[0]) return res.status(400).json({ error: `Mã căn "${c}" đã tồn tại` });
      updates.code = c;
    }
    // type
    if (b.type !== undefined) {
      if (!VALID_TYPES.includes(b.type)) {
        return res.status(400).json({ error: `Loại sản phẩm không hợp lệ (${VALID_TYPES.join(', ')})` });
      }
      updates.type = b.type;
    }
    // price
    if (b.price !== undefined) {
      const p = numOrNull(b.price);
      if (p === undefined || p === null || p <= 0) {
        return res.status(400).json({ error: 'Giá bán phải lớn hơn 0' });
      }
      updates.price = p;
    }
    // area
    if (b.area !== undefined) {
      const a = b.area === null || b.area === '' ? null : numOrNull(b.area);
      if (a === undefined) return res.status(400).json({ error: 'Diện tích không hợp lệ' });
      updates.area = a;
    }
    // bedrooms
    if (b.bedrooms !== undefined) {
      const bd = b.bedrooms === null || b.bedrooms === '' ? null : parseInt(b.bedrooms, 10);
      if (bd !== null && (!Number.isInteger(bd) || bd < 0)) {
        return res.status(400).json({ error: 'Số phòng ngủ không hợp lệ' });
      }
      updates.bedrooms = bd;
    }
    // direction
    if (b.direction !== undefined) {
      updates.direction = b.direction ? String(b.direction).trim() : null;
    }
    // floor
    if (b.floor !== undefined) {
      const f = b.floor === null || b.floor === '' ? null : parseInt(b.floor, 10);
      if (f !== null && !Number.isInteger(f)) {
        return res.status(400).json({ error: 'Tầng không hợp lệ' });
      }
      updates.floor = f;
    }
    // quantity
    if (b.quantity !== undefined) {
      const qt = parseInt(b.quantity, 10);
      if (!Number.isInteger(qt) || qt < 1) {
        return res.status(400).json({ error: 'Số lượng phải là số nguyên ≥ 1' });
      }
      updates.quantity = qt;
    }
    // images
    if (b.images !== undefined) {
      updates.images = b.images;
    }
    // status
    if (b.status !== undefined) {
      const dbStatus = normStatus(b.status);
      if (dbStatus === null) {
        return res.status(400).json({ error: `Trạng thái không hợp lệ (${VALID_STATUSES.join(', ')})` });
      }
      if (dbStatus !== prop.status) {
        // Không cho đổi về 'trong' khi còn deal active
        if (dbStatus === 'trong') {
          const active = await q(
            `SELECT COUNT(*)::int AS c FROM deals
             WHERE property_id = $1 AND status = ANY($2::deal_status[])`,
            [prop.id, ACTIVE_DEAL_STATUSES]
          );
          if (active.rows[0].c > 0) {
            return res.status(409).json({ error: 'Không thể mở bán lại: căn đang có giao dịch active (giữ chỗ/cọc/ký)' });
          }
        }
        updates.status = dbStatus;
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.json(mapProperty(prop));
    }

    Object.keys(updates).forEach((k) => {
      params.push(updates[k]);
      setClauses.push(`${k} = $${params.length}`);
    });
    params.push(prop.id);
    const { rows: updated } = await q(
      `UPDATE properties SET ${setClauses.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    res.json(mapProperty(updated[0]));
  } catch (err) {
    console.error('[properties:update]', err.message);
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Mã căn đã tồn tại' });
    }
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// DELETE /properties/:id — xóa (chỉ khi chưa có deal nào)
router.delete('/:id', async (req, res) => {
  try {
    const prop = await q('SELECT id FROM properties WHERE id = $1', [req.params.id]);
    if (!prop.rows[0]) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
    const cnt = await q('SELECT COUNT(*)::int AS c FROM deals WHERE property_id = $1', [req.params.id]);
    if (cnt.rows[0].c > 0) {
      return res.status(409).json({ error: 'Không thể xóa: sản phẩm đã có giao dịch liên quan' });
    }
    await q('DELETE FROM properties WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[properties:delete]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

export default router;
