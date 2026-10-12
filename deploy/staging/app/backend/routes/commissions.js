import { Router } from 'express';
import { q } from '../db.js';
import { auth } from '../middleware/auth.js';

const router = Router();
router.use(auth);

const STATUS_LABELS = {
  cho_duyet: 'Chờ duyệt',
  da_duyet: 'Đã duyệt',
  da_chi: 'Đã chi',
};

const TYPE_LABELS = {
  ca_nhan: 'Cá nhân',
  doi_nhom: 'Đội nhóm',
};

function mapCommission(row) {
  if (!row) return row;
  return {
    ...row,
    status_label: STATUS_LABELS[row.status] || row.status,
    type_label: TYPE_LABELS[row.type] || row.type,
  };
}

// GET /commissions — danh sách hoa hồng của user, filter ?status=
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    const params = [req.user.id];
    const conds = ['c.sale_id = $1'];
    if (status) {
      if (!STATUS_LABELS[status]) {
        return res.status(400).json({ error: 'Trạng thái không hợp lệ' });
      }
      params.push(status);
      conds.push(`c.status = $${params.length}`);
    }
    const { rows } = await q(
      `SELECT c.*, l.full_name AS lead_name, l.phone AS lead_phone,
              p.code AS property_code, d.agreed_price
       FROM commissions c
       JOIN deals d ON d.id = c.deal_id
       JOIN leads l ON l.id = d.lead_id
       LEFT JOIN properties p ON p.id = d.property_id
       WHERE ${conds.join(' AND ')}
       ORDER BY c.created_at DESC`,
      params
    );
    res.json(rows.map(mapCommission));
  } catch (err) {
    console.error('[commissions:list]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// GET /commissions/summary — tổng theo trạng thái
router.get('/summary', async (req, res) => {
  try {
    const { rows } = await q(
      `SELECT c.status, COUNT(*)::int AS count, COALESCE(SUM(c.amount), 0)::numeric AS total
       FROM commissions c
       WHERE c.sale_id = $1
       GROUP BY c.status`,
      [req.user.id]
    );
    const byStatus = {};
    let grandTotal = 0;
    let grandCount = 0;
    for (const r of rows) {
      byStatus[r.status] = {
        count: r.count,
        total: Number(r.total),
        label: STATUS_LABELS[r.status] || r.status,
      };
      grandTotal += Number(r.total);
      grandCount += r.count;
    }
    // Đảm bảo đủ 3 trạng thái kể cả khi chưa có dữ liệu
    for (const s of Object.keys(STATUS_LABELS)) {
      if (!byStatus[s]) byStatus[s] = { count: 0, total: 0, label: STATUS_LABELS[s] };
    }
    res.json({ by_status: byStatus, total: grandTotal, count: grandCount });
  } catch (err) {
    console.error('[commissions:summary]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// PATCH /commissions/:id/status — chuyển trạng thái theo luồng hợp lệ
// ca_nhan: cho_duyet → da_chi
// doi_nhom: cho_duyet → da_duyet → da_chi
const VALID_TRANSITIONS = {
  'ca_nhan:cho_duyet': ['da_chi'],
  'doi_nhom:cho_duyet': ['da_duyet'],
  'doi_nhom:da_duyet': ['da_chi'],
};

router.patch('/:id/status', async (req, res) => {
  const { status } = req.body || {};
  if (!status || !STATUS_LABELS[status]) {
    return res.status(400).json({ error: 'Trạng thái không hợp lệ' });
  }
  try {
    const { rows } = await q(
      'SELECT * FROM commissions WHERE id = $1 AND sale_id = $2',
      [req.params.id, req.user.id]
    );
    const c = rows[0];
    if (!c) return res.status(404).json({ error: 'Không tìm thấy hoa hồng' });

    const key = `${c.type}:${c.status}`;
    const allowed = VALID_TRANSITIONS[key] || [];
    if (!allowed.includes(status)) {
      return res.status(400).json({
        error: 'Chuyển trạng thái không hợp lệ',
        hint: `Loại ${TYPE_LABELS[c.type]} chỉ cho phép: ${key} → ${allowed.join(', ') || '(không có bước tiếp theo)'}`,
      });
    }

    const { rows: out } = await q(
      `UPDATE commissions SET status = $1, updated_at = now()
       WHERE id = $2 RETURNING *`,
      [status, c.id]
    );
    res.json(mapCommission(out[0]));
  } catch (err) {
    console.error('[commissions:status]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

export default router;
