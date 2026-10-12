import { Router } from 'express';
import { q } from '../db.js';
import { auth } from '../middleware/auth.js';

const router = Router();
router.use(auth);

function mapPolicy(row) {
  if (!row) return row;
  const today = new Date().toISOString().slice(0, 10);
  const expired =
    (row.valid_to && row.valid_to < today) || false;
  const upcoming =
    (row.valid_from && row.valid_from > today) || false;
  return {
    ...row,
    status_label: expired ? 'Hết hạn' : upcoming ? 'Sắp áp dụng' : 'Đang áp dụng',
  };
}

// GET /price-policies?project_id= — danh sách chính sách giá
router.get('/', async (req, res) => {
  try {
    const { project_id } = req.query;
    const params = [];
    const conds = [];
    if (project_id) {
      params.push(project_id);
      conds.push(`pp.project_id = $${params.length}`);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const { rows } = await q(
      `SELECT pp.*, p.name AS project_name, u.full_name AS created_by_name
       FROM price_policies pp
       JOIN projects p ON p.id = pp.project_id
       LEFT JOIN users u ON u.id = pp.created_by
       ${where}
       ORDER BY pp.valid_from DESC NULLS LAST, pp.created_at DESC`,
      params
    );
    res.json(rows.map(mapPolicy));
  } catch (err) {
    console.error('[price-policies:list]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// GET /price-policies/:id — chi tiết
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await q(
      `SELECT pp.*, p.name AS project_name
       FROM price_policies pp
       JOIN projects p ON p.id = pp.project_id
       WHERE pp.id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Không tìm thấy chính sách' });
    res.json(mapPolicy(rows[0]));
  } catch (err) {
    console.error('[price-policies:detail]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// POST /price-policies — tạo mới
router.post('/', async (req, res) => {
  try {
    const { project_id, name, discount_rate, gift, valid_from, valid_to } = req.body || {};
    if (!project_id || !name || !String(name).trim()) {
      return res.status(400).json({ error: 'Thiếu project_id hoặc tên chính sách' });
    }
    if (valid_from && valid_to && valid_from > valid_to) {
      return res.status(400).json({ error: 'Ngày bắt đầu phải trước ngày kết thúc' });
    }
    const { rows } = await q(
      `INSERT INTO price_policies (project_id, name, discount_rate, gift, valid_from, valid_to, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        project_id,
        String(name).trim(),
        discount_rate ?? null,
        gift || null,
        valid_from || null,
        valid_to || null,
        req.user.id,
      ]
    );
    res.status(201).json(mapPolicy(rows[0]));
  } catch (err) {
    console.error('[price-policies:create]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// PATCH /price-policies/:id — sửa
router.patch('/:id', async (req, res) => {
  try {
    const { name, discount_rate, gift, valid_from, valid_to } = req.body || {};
    if (valid_from && valid_to && valid_from > valid_to) {
      return res.status(400).json({ error: 'Ngày bắt đầu phải trước ngày kết thúc' });
    }
    const sets = [];
    const params = [];
    const push = (col, val) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };
    if (name !== undefined) push('name', String(name).trim());
    if (discount_rate !== undefined) push('discount_rate', discount_rate ?? null);
    if (gift !== undefined) push('gift', gift || null);
    if (valid_from !== undefined) push('valid_from', valid_from || null);
    if (valid_to !== undefined) push('valid_to', valid_to || null);
    if (!sets.length) return res.status(400).json({ error: 'Không có gì để cập nhật' });
    params.push(req.params.id);
    const { rows } = await q(
      `UPDATE price_policies SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: 'Không tìm thấy chính sách' });
    res.json(mapPolicy(rows[0]));
  } catch (err) {
    console.error('[price-policies:update]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// DELETE /price-policies/:id — xóa
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await q('DELETE FROM price_policies WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Không tìm thấy chính sách' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[price-policies:delete]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

export default router;
