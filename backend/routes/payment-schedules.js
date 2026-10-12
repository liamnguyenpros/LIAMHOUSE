import { Router } from 'express';
import { q } from '../db.js';
import { auth } from '../middleware/auth.js';

const router = Router();
router.use(auth);

// Kiểm tra deal thuộc về user (sale phụ trách)
async function getDeal(dealId, userId) {
  const { rows } = await q('SELECT * FROM deals WHERE id = $1 AND sale_id = $2', [dealId, userId]);
  return rows[0] || null;
}

// Tính trạng thái hiện tại của 1 đợt (động, theo ngày hiện tại VN)
function computeStatus(row) {
  const amount = Number(row.amount);
  const paid = Number(row.paid_amount);
  if (paid >= amount) return 'da_thanh_toan';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(row.due_date);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due - today) / 86400000);
  if (diffDays < 0) return 'qua_han';
  if (paid > 0) return 'thanh_toan_mot_phan';
  if (diffDays <= 7) return 'sap_den_han';
  return 'chua_den_han';
}

const STATUS_LABELS = {
  chua_den_han: 'Chưa đến hạn',
  sap_den_han: 'Sắp đến hạn',
  qua_han: 'Quá hạn',
  da_thanh_toan: 'Đã thanh toán',
  thanh_toan_mot_phan: 'Thanh toán một phần',
};

function mapSchedule(row) {
  if (!row) return row;
  const amount = Number(row.amount);
  const paid = Number(row.paid_amount);
  const trang_thai = computeStatus(row);
  return {
    ...row,
    amount,
    paid_amount: paid,
    con_no: Math.max(0, amount - paid),
    trang_thai_hien_tai: trang_thai,
    trang_thai_label: STATUS_LABELS[trang_thai] || trang_thai,
  };
}

function fmtMoney(v) {
  return Number(v).toLocaleString('vi-VN') + 'đ';
}

// Tạo notification nhắc nợ nếu chưa có trong 24h qua. Trả về true nếu đã tạo.
async function notifyIfNeeded(schedule, deal, kind) {
  // kind: 'overdue' | 'upcoming'
  const refType = 'payment_schedule';
  const since = await q(
    `SELECT id FROM notifications
     WHERE user_id = $1 AND ref_type = $2 AND ref_id = $3 AND created_at > now() - interval '24 hours'
     LIMIT 1`,
    [deal.sale_id, refType, schedule.id]
  );
  if (since.rows[0]) return false;

  const leadRes = await q('SELECT full_name, phone FROM leads WHERE id = $1', [deal.lead_id]);
  const lead = leadRes.rows[0] || {};
  const isOverdue = kind === 'overdue';
  const title = isOverdue
    ? `Quá hạn thanh toán: ${lead.full_name || 'Khách hàng'}`
    : `Sắp đến hạn thanh toán: ${lead.full_name || 'Khách hàng'}`;
  const body =
    `${schedule.label || 'Đợt thanh toán'} — ${fmtMoney(Number(schedule.amount) - Number(schedule.paid_amount))} còn nợ` +
    `, đến hạn ${schedule.due_date}${lead.phone ? ` (SĐT: ${lead.phone})` : ''}`;

  await q(
    `INSERT INTO notifications (user_id, type, title, body, ref_type, ref_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      deal.sale_id,
      isOverdue ? 'follow_up_overdue' : 'kpi_warning',
      title,
      body,
      refType,
      schedule.id,
    ]
  );
  return true;
}

// GET /deals/:dealId/payment-schedules — danh sách các đợt của 1 deal
router.get('/deals/:dealId/payment-schedules', async (req, res) => {
  try {
    const deal = await getDeal(req.params.dealId, req.user.id);
    if (!deal) return res.status(404).json({ error: 'Không tìm thấy giao dịch' });
    const { rows } = await q(
      `SELECT * FROM payment_schedules
       WHERE deal_id = $1 AND workspace_id = $2
       ORDER BY dot_number ASC`,
      [deal.id, req.user.workspace_id]
    );
    const data = rows.map(mapSchedule);
    const tong_phai_tra = data.reduce((s, r) => s + r.amount, 0);
    const tong_da_tra = data.reduce((s, r) => s + r.paid_amount, 0);
    res.json({
      deal_id: deal.id,
      data,
      tong_phai_tra,
      tong_da_tra,
      tong_con_no: Math.max(0, tong_phai_tra - tong_da_tra),
    });
  } catch (err) {
    console.error('[payment-schedules:list]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// POST /deals/:dealId/payment-schedules — tạo 1 đợt thủ công
router.post('/deals/:dealId/payment-schedules', async (req, res) => {
  const { label, due_date, amount, note } = req.body || {};
  if (!due_date || amount == null) {
    return res.status(400).json({ error: 'Vui lòng nhập ngày đến hạn và số tiền' });
  }
  const amt = Number(amount);
  if (Number.isNaN(amt) || amt <= 0) {
    return res.status(400).json({ error: 'Số tiền phải lớn hơn 0' });
  }
  try {
    const deal = await getDeal(req.params.dealId, req.user.id);
    if (!deal) return res.status(404).json({ error: 'Không tìm thấy giao dịch' });
    const maxRes = await q(
      'SELECT COALESCE(MAX(dot_number), 0)::int AS m FROM payment_schedules WHERE deal_id = $1',
      [deal.id]
    );
    const { rows } = await q(
      `INSERT INTO payment_schedules
         (workspace_id, deal_id, dot_number, label, due_date, amount, note)
       VALUES ($1, $2, $3, $4, $5::date, $6, $7)
       RETURNING *`,
      [
        req.user.workspace_id,
        deal.id,
        maxRes.rows[0].m + 1,
        label || `Đợt ${maxRes.rows[0].m + 1}`,
        due_date,
        amt,
        note || null,
      ]
    );
    res.status(201).json(mapSchedule(rows[0]));
  } catch (err) {
    console.error('[payment-schedules:create]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// POST /deals/:dealId/payment-schedules/generate — tự chia thành N đợt đều nhau
router.post('/deals/:dealId/payment-schedules/generate', async (req, res) => {
  const { so_dot, ngay_bat_dau, khoang_cach_ngay } = req.body || {};
  const n = parseInt(so_dot, 10);
  const gap = parseInt(khoang_cach_ngay, 10) || 30;
  if (!n || n < 1 || n > 60) {
    return res.status(400).json({ error: 'Số đợt phải từ 1 đến 60' });
  }
  if (!ngay_bat_dau) {
    return res.status(400).json({ error: 'Vui lòng chọn ngày bắt đầu' });
  }
  try {
    const deal = await getDeal(req.params.dealId, req.user.id);
    if (!deal) return res.status(404).json({ error: 'Không tìm thấy giao dịch' });

    const agreed = Number(deal.agreed_price) || 0;
    const deposited = Number(deal.deposit_amount) || 0;
    const remaining = agreed - deposited;
    if (remaining <= 0) {
      return res.status(400).json({ error: 'Giao dịch không còn số tiền cần chia đợt' });
    }

    const maxRes = await q(
      'SELECT COALESCE(MAX(dot_number), 0)::int AS m FROM payment_schedules WHERE deal_id = $1',
      [deal.id]
    );
    let startDot = maxRes.rows[0].m;

    // Chia đều, đợt cuối nhận phần lẻ để tổng khớp
    const base = Math.floor((remaining / n) * 100) / 100;
    const created = [];
    const startDate = new Date(ngay_bat_dau);
    for (let i = 0; i < n; i++) {
      const isLast = i === n - 1;
      const amt = isLast ? Math.round((remaining - base * (n - 1)) * 100) / 100 : base;
      const due = new Date(startDate);
      due.setDate(due.getDate() + gap * i);
      const dueStr = due.toISOString().slice(0, 10);
      startDot += 1;
      const { rows } = await q(
        `INSERT INTO payment_schedules
           (workspace_id, deal_id, dot_number, label, due_date, amount)
         VALUES ($1, $2, $3, $4, $5::date, $6)
         RETURNING *`,
        [
          req.user.workspace_id,
          deal.id,
          startDot,
          `Đợt ${startDot}`,
          dueStr,
          amt,
        ]
      );
      created.push(mapSchedule(rows[0]));
    }
    res.status(201).json({
      deal_id: deal.id,
      tong_chia: remaining,
      so_dot_tao: created.length,
      data: created,
    });
  } catch (err) {
    console.error('[payment-schedules:generate]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// PATCH /payment-schedules/:id/pay — ghi nhận thanh toán
router.patch('/payment-schedules/:id/pay', async (req, res) => {
  const amt = Number((req.body || {}).amount);
  if (Number.isNaN(amt) || amt <= 0) {
    return res.status(400).json({ error: 'Số tiền thanh toán phải lớn hơn 0' });
  }
  try {
    const { rows } = await q(
      `SELECT ps.*, d.sale_id FROM payment_schedules ps
       JOIN deals d ON d.id = ps.deal_id
       WHERE ps.id = $1 AND ps.workspace_id = $2 AND d.sale_id = $3`,
      [req.params.id, req.user.workspace_id, req.user.id]
    );
    const sch = rows[0];
    if (!sch) return res.status(404).json({ error: 'Không tìm thấy đợt thanh toán' });

    const newPaid = Number(sch.paid_amount) + amt;
    const fullAmount = Number(sch.amount);
    const isFull = newPaid >= fullAmount;
    const newStatus = isFull ? 'da_thanh_toan' : 'thanh_toan_mot_phan';
    const setParts = ['paid_amount = $1', 'status = $2', 'updated_at = now()'];
    const params = [Math.min(newPaid, fullAmount), newStatus];
    if (isFull) setParts.push('paid_at = COALESCE(paid_at, now())');
    params.push(sch.id);
    const { rows: upd } = await q(
      `UPDATE payment_schedules SET ${setParts.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    res.json(mapSchedule(upd[0]));
  } catch (err) {
    console.error('[payment-schedules:pay]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// DELETE /payment-schedules/:id — chỉ xóa đợt chưa thanh toán
router.delete('/payment-schedules/:id', async (req, res) => {
  try {
    const { rows } = await q(
      `SELECT ps.id, ps.paid_amount FROM payment_schedules ps
       JOIN deals d ON d.id = ps.deal_id
       WHERE ps.id = $1 AND ps.workspace_id = $2 AND d.sale_id = $3`,
      [req.params.id, req.user.workspace_id, req.user.id]
    );
    const sch = rows[0];
    if (!sch) return res.status(404).json({ error: 'Không tìm thấy đợt thanh toán' });
    if (Number(sch.paid_amount) > 0) {
      return res.status(400).json({ error: 'Không thể xóa đợt đã có thanh toán' });
    }
    await q('DELETE FROM payment_schedules WHERE id = $1', [sch.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[payment-schedules:delete]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// GET /payment-schedules/overdue — các đợt quá hạn (kèm tự động nhắc nợ)
router.get('/payment-schedules/overdue', async (req, res) => {
  try {
    const { rows } = await q(
      `SELECT ps.*, d.lead_id, d.sale_id, l.full_name AS lead_name, l.phone AS lead_phone,
              p.code AS property_code
       FROM payment_schedules ps
       JOIN deals d ON d.id = ps.deal_id
       JOIN leads l ON l.id = d.lead_id
       LEFT JOIN properties p ON p.id = d.property_id
       WHERE ps.workspace_id = $1
         AND ps.paid_amount < ps.amount
         AND ps.due_date < (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
       ORDER BY ps.due_date ASC`,
      [req.user.workspace_id]
    );
    let reminded = 0;
    for (const r of rows) {
      const deal = { id: r.deal_id, sale_id: r.sale_id, lead_id: r.lead_id };
      if (await notifyIfNeeded(r, deal, 'overdue')) reminded += 1;
    }
    res.json({ total: rows.length, reminded, data: rows.map(mapSchedule) });
  } catch (err) {
    console.error('[payment-schedules:overdue]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// GET /payment-schedules/upcoming — các đợt đến hạn trong 7 ngày tới (kèm nhắc nợ)
router.get('/payment-schedules/upcoming', async (req, res) => {
  try {
    const { rows } = await q(
      `SELECT ps.*, d.lead_id, d.sale_id, l.full_name AS lead_name, l.phone AS lead_phone,
              p.code AS property_code
       FROM payment_schedules ps
       JOIN deals d ON d.id = ps.deal_id
       JOIN leads l ON l.id = d.lead_id
       LEFT JOIN properties p ON p.id = d.property_id
       WHERE ps.workspace_id = $1
         AND ps.paid_amount < ps.amount
         AND ps.due_date >= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
         AND ps.due_date <= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + interval '7 days'
       ORDER BY ps.due_date ASC`,
      [req.user.workspace_id]
    );
    let reminded = 0;
    for (const r of rows) {
      const deal = { id: r.deal_id, sale_id: r.sale_id, lead_id: r.lead_id };
      if (await notifyIfNeeded(r, deal, 'upcoming')) reminded += 1;
    }
    res.json({ total: rows.length, reminded, data: rows.map(mapSchedule) });
  } catch (err) {
    console.error('[payment-schedules:upcoming]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

export default router;
