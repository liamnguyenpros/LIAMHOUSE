import { Router } from 'express';
import { q } from '../db.js';
import { auth } from '../middleware/auth.js';

const router = Router();
router.use(auth);

const VALID_ROLES = ['sale', 'truong_phong', 'giam_doc_san'];
const VALID_TYPES = ['ca_nhan', 'doi_nhom'];
const VALID_STATUSES = ['active', 'expired', 'draft'];

const ROLE_LABELS = {
  sale: 'Sale',
  truong_phong: 'Trưởng phòng',
  giam_doc_san: 'Giám đốc sàn',
};
const TYPE_LABELS = {
  ca_nhan: 'Cá nhân',
  doi_nhom: 'Đội nhóm',
};
const STATUS_LABELS = {
  active: 'Đang áp dụng',
  expired: 'Hết hạn',
  draft: 'Nháp',
};

function mapRule(row) {
  if (!row) return row;
  return {
    ...row,
    role_label: ROLE_LABELS[row.role] || row.role,
    type_label: TYPE_LABELS[row.commission_type] || row.commission_type,
    status_label: STATUS_LABELS[row.status] || row.status,
  };
}

// GET /commission-rules?status=active — danh sách cấu hình hoa hồng
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    const params = [];
    const conds = [];
    if (status) {
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: 'Trạng thái không hợp lệ' });
      }
      params.push(status);
      conds.push(`cr.status = $${params.length}`);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const { rows } = await q(
      `SELECT cr.*, p.name AS project_name, u.full_name AS created_by_name
       FROM commission_rules cr
       LEFT JOIN projects p ON p.id = cr.project_id
       LEFT JOIN users u ON u.id = cr.created_by
       ${where}
       ORDER BY cr.status, cr.created_at DESC`,
      params
    );
    res.json(rows.map(mapRule));
  } catch (err) {
    console.error('[commission-rules:list]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// GET /commission-rules/:id — chi tiết
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await q(
      `SELECT cr.*, p.name AS project_name
       FROM commission_rules cr
       LEFT JOIN projects p ON p.id = cr.project_id
       WHERE cr.id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Không tìm thấy cấu hình' });
    res.json(mapRule(rows[0]));
  } catch (err) {
    console.error('[commission-rules:detail]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// POST /commission-rules — tạo mới
router.post('/', async (req, res) => {
  try {
    const {
      name, project_id, role, commission_type, rate,
      min_deals, min_revenue, valid_from, valid_to, status,
    } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Thiếu tên cấu hình' });
    }
    if (role && !VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Role không hợp lệ' });
    }
    if (commission_type && !VALID_TYPES.includes(commission_type)) {
      return res.status(400).json({ error: 'Loại hoa hồng không hợp lệ' });
    }
    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Trạng thái không hợp lệ' });
    }
    if (rate == null || Number(rate) < 0) {
      return res.status(400).json({ error: 'Tỷ lệ hoa hồng phải >= 0' });
    }
    if (valid_from && valid_to && valid_from > valid_to) {
      return res.status(400).json({ error: 'Ngày bắt đầu phải trước ngày kết thúc' });
    }
    const { rows } = await q(
      `INSERT INTO commission_rules
         (name, project_id, role, commission_type, rate, min_deals, min_revenue, valid_from, valid_to, created_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [
        String(name).trim(),
        project_id || null,
        role || 'sale',
        commission_type || 'ca_nhan',
        rate,
        min_deals ?? null,
        min_revenue ?? null,
        valid_from || null,
        valid_to || null,
        req.user.id,
        status || 'active',
      ]
    );
    res.status(201).json(mapRule(rows[0]));
  } catch (err) {
    console.error('[commission-rules:create]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// PATCH /commission-rules/:id — sửa
router.patch('/:id', async (req, res) => {
  try {
    const {
      name, project_id, role, commission_type, rate,
      min_deals, min_revenue, valid_from, valid_to, status,
    } = req.body || {};
    if (role !== undefined && !VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Role không hợp lệ' });
    }
    if (commission_type !== undefined && !VALID_TYPES.includes(commission_type)) {
      return res.status(400).json({ error: 'Loại hoa hồng không hợp lệ' });
    }
    if (status !== undefined && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Trạng thái không hợp lệ' });
    }
    if (rate !== undefined && (rate == null || Number(rate) < 0)) {
      return res.status(400).json({ error: 'Tỷ lệ hoa hồng phải >= 0' });
    }
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
    if (project_id !== undefined) push('project_id', project_id || null);
    if (role !== undefined) push('role', role);
    if (commission_type !== undefined) push('commission_type', commission_type);
    if (rate !== undefined) push('rate', rate);
    if (min_deals !== undefined) push('min_deals', min_deals ?? null);
    if (min_revenue !== undefined) push('min_revenue', min_revenue ?? null);
    if (valid_from !== undefined) push('valid_from', valid_from || null);
    if (valid_to !== undefined) push('valid_to', valid_to || null);
    if (status !== undefined) push('status', status);
    if (!sets.length) return res.status(400).json({ error: 'Không có gì để cập nhật' });
    params.push(req.params.id);
    const { rows } = await q(
      `UPDATE commission_rules SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: 'Không tìm thấy cấu hình' });
    res.json(mapRule(rows[0]));
  } catch (err) {
    console.error('[commission-rules:update]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// DELETE /commission-rules/:id — xóa
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await q('DELETE FROM commission_rules WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Không tìm thấy cấu hình' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[commission-rules:delete]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

export default router;
