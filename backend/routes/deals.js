import { Router } from 'express';
import { q, tx, mapDeal, VN_TODAY, VN_MONTH } from '../db.js';
import { auth } from '../middleware/auth.js';
import { STAGE_LABELS } from './leads.js';

const router = Router();
router.use(auth);

router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    const params = [req.user.id];
    const conds = ['d.sale_id = $1'];
    if (status) {
      params.push(status);
      conds.push(`d.status = $${params.length}`);
    }
    const { rows } = await q(
      `SELECT d.*, l.full_name AS lead_name, p.code AS property_code
       FROM deals d
       JOIN leads l ON l.id = d.lead_id
       LEFT JOIN properties p ON p.id = d.property_id
       WHERE ${conds.join(' AND ')} ORDER BY d.created_at DESC`,
      params
    );
    res.json(rows.map(mapDeal));
  } catch (err) {
    console.error('[deals:list]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

router.post('/', async (req, res) => {
  const { lead_id, property_id, value, hold_amount } = req.body || {};
  if (!lead_id || !value) {
    return res.status(400).json({ error: 'Vui lòng chọn khách hàng và nhập giá trị' });
  }
  try {
    const deal = await tx(async (client) => {
      const chk = await client.query(
        'SELECT id FROM leads WHERE id = $1 AND assigned_to = $2',
        [lead_id, req.user.id]
      );
      if (!chk.rows[0]) {
        const e = new Error('NOT_FOUND_LEAD');
        e.statusCode = 404;
        throw e;
      }
      // Nếu gắn căn: kiểm tra căn chưa bị khóa (da_coc/da_ban) và tính queue_priority
      let priority = null;
      if (property_id) {
        const pchk = await client.query(
          'SELECT id, status, code FROM properties WHERE id = $1',
          [property_id]
        );
        const prop = pchk.rows[0];
        if (!prop) {
          const e = new Error('NOT_FOUND_PROPERTY');
          e.statusCode = 404;
          throw e;
        }
        if (['da_coc', 'da_ban'].includes(prop.status)) {
          const e = new Error('PROPERTY_LOCKED');
          e.statusCode = 400;
          throw e;
        }
        // Hàng đợi giữ chỗ: priority = max hiện tại + 1 (giữ chỗ không khóa căn)
        const qchk = await client.query(
          `SELECT COALESCE(MAX(queue_priority), 0)::int AS max_p FROM deals
           WHERE property_id = $1 AND status = 'giu_cho'`,
          [property_id]
        );
        priority = qchk.rows[0].max_p + 1;
      }
      const { rows } = await client.query(
        `INSERT INTO deals (lead_id, property_id, sale_id, agreed_price, status,
                            hold_amount, hold_at, hold_expires_at, queue_priority)
         VALUES ($1, $2, $3, $4, 'giu_cho',
                 $5, now(), now() + interval '7 days', $6)
         RETURNING *`,
        [lead_id, property_id || null, req.user.id, Number(value),
         hold_amount ? Number(hold_amount) : null, priority]
      );
      // Giữ chỗ KHÔNG khóa căn: properties.status giữ nguyên
      const actContent = property_id
        ? `Giữ chỗ căn (ưu tiên ${priority}) trị giá ${Number(value).toLocaleString('vi-VN')}đ` +
          (hold_amount ? `, tiền giữ chỗ ${Number(hold_amount).toLocaleString('vi-VN')}đ` : '')
        : `Tạo giao dịch trị giá ${Number(value).toLocaleString('vi-VN')}đ`;
      await client.query(
        `INSERT INTO activities (lead_id, user_id, type, content) VALUES ($1, $2, 'ghi_chu', $3)`,
        [lead_id, req.user.id, actContent]
      );
      return rows[0];
    });
    res.status(201).json(mapDeal(deal));
  } catch (err) {
    if (err.statusCode === 404) {
      return res.status(404).json({ error: err.message === 'NOT_FOUND_PROPERTY' ? 'Không tìm thấy căn' : 'Không tìm thấy lead' });
    }
    if (err.statusCode === 400 && err.message === 'PROPERTY_LOCKED') {
      return res.status(400).json({ error: 'Căn đã được đặt cọc/bán, không thể giữ chỗ' });
    }
    console.error('[deals:create]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await q(
      `SELECT d.*, l.full_name AS lead_name, l.phone AS lead_phone, p.code AS property_code,
              pr.name AS project_name
       FROM deals d
       JOIN leads l ON l.id = d.lead_id
       LEFT JOIN properties p ON p.id = d.property_id
       LEFT JOIN projects pr ON pr.id = p.project_id
       WHERE d.id = $1 AND d.sale_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Không tìm thấy giao dịch' });
    res.json(mapDeal(rows[0]));
  } catch (err) {
    console.error('[deals:detail]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// Hủy deal: đổi status sang 'huy', ghi lý do, nhả căn về 'trong'
router.patch('/:id/cancel', async (req, res) => {
  const { ly_do } = req.body || {};
  if (!ly_do || !String(ly_do).trim()) {
    return res.status(400).json({ error: 'Vui lòng nhập lý do hủy' });
  }
  try {
    const deal = await tx(async (client) => {
      const { rows } = await client.query(
        'SELECT * FROM deals WHERE id = $1 AND sale_id = $2',
        [req.params.id, req.user.id]
      );
      const d = rows[0];
      if (!d) {
        const e = new Error('NOT_FOUND');
        e.statusCode = 404;
        throw e;
      }
      if (['ky_hd', 'ban_giao', 'huy'].includes(d.status)) {
        const e = new Error('CANNOT_CANCEL');
        e.statusCode = 400;
        throw e;
      }
      await client.query(
        `UPDATE deals SET status = 'huy', cancel_reason = $1, queue_priority = NULL, updated_at = now() WHERE id = $2`,
        [String(ly_do).trim(), d.id]
      );
      if (d.property_id) {
        // Nếu hủy giữ chỗ: đôn hàng đợi (không nhả căn vì giữ chỗ không khóa căn)
        if (d.status === 'giu_cho' && d.queue_priority) {
          await client.query(
            `UPDATE deals SET queue_priority = queue_priority - 1, updated_at = now()
             WHERE property_id = $1 AND status = 'giu_cho' AND queue_priority > $2`,
            [d.property_id, d.queue_priority]
          );
        } else if (d.status === 'dat_coc') {
          // Nếu hủy cọc: nhả căn về trống
          await client.query(`UPDATE properties SET status = 'trong' WHERE id = $1`, [d.property_id]);
        }
      }
      await client.query(
        `INSERT INTO activities (lead_id, user_id, type, content) VALUES ($1, $2, 'doi_trang_thai', $3)`,
        [d.lead_id, req.user.id, `Hủy giao dịch. Lý do: ${String(ly_do).trim()}`]
      );
      const { rows: out } = await client.query('SELECT * FROM deals WHERE id = $1', [d.id]);
      return out[0];
    });
    res.json(mapDeal(deal));
  } catch (err) {
    if (err.statusCode === 404) return res.status(404).json({ error: 'Không tìm thấy giao dịch' });
    if (err.statusCode === 400) return res.status(400).json({ error: 'Giao dịch đã ký/hủy, không thể hủy' });
    console.error('[deals:cancel]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// Hủy giữ chỗ: deal → 'huy', hoàn tiền giữ chỗ, đôn hàng đợi
router.post('/:id/cancel-hold', async (req, res) => {
  const { ly_do } = req.body || {};
  try {
    const deal = await tx(async (client) => {
      const { rows } = await client.query(
        'SELECT * FROM deals WHERE id = $1 AND sale_id = $2',
        [req.params.id, req.user.id]
      );
      const d = rows[0];
      if (!d) {
        const e = new Error('NOT_FOUND');
        e.statusCode = 404;
        throw e;
      }
      if (d.status !== 'giu_cho') {
        const e = new Error('NOT_HOLD');
        e.statusCode = 400;
        throw e;
      }
      await client.query(
        `UPDATE deals SET status = 'huy', cancel_reason = $1, updated_at = now() WHERE id = $2`,
        [ly_do ? String(ly_do).trim() : 'Hủy giữ chỗ', d.id]
      );
      // Hoàn tiền giữ chỗ: log vào activities
      if (d.hold_amount && Number(d.hold_amount) > 0) {
        const { rows: lr } = await client.query(
          'SELECT full_name FROM leads WHERE id = $1', [d.lead_id]
        );
        const customerName = lr[0]?.full_name || 'khách hàng';
        await client.query(
          `INSERT INTO activities (lead_id, user_id, type, content) VALUES ($1, $2, 'ghi_chu', $3)`,
          [d.lead_id, req.user.id,
           `Hoàn tiền giữ chỗ ${Number(d.hold_amount).toLocaleString('vi-VN')}đ cho khách ${customerName}`]
        );
      }
      // Đôn hàng: các lượt giu_cho còn lại trên cùng căn giảm priority đi 1
      if (d.property_id && d.queue_priority) {
        await client.query(
          `UPDATE deals SET queue_priority = queue_priority - 1, updated_at = now()
           WHERE property_id = $1 AND status = 'giu_cho' AND queue_priority > $2`,
          [d.property_id, d.queue_priority]
        );
      }
      const { rows: out } = await client.query('SELECT * FROM deals WHERE id = $1', [d.id]);
      return out[0];
    });
    res.json(mapDeal(deal));
  } catch (err) {
    if (err.statusCode === 404) return res.status(404).json({ error: 'Không tìm thấy giao dịch' });
    if (err.statusCode === 400) return res.status(400).json({ error: 'Chỉ hủy được giao dịch đang giữ chỗ' });
    console.error('[deals:cancel-hold]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// Chuyển giữ chỗ sang đặt cọc: chỉ ưu tiên 1 được chuyển, khóa căn, hủy các lượt giữ còn lại
router.post('/:id/to-deposit', async (req, res) => {
  const { deposit_amount } = req.body || {};
  if (!deposit_amount || Number(deposit_amount) <= 0) {
    return res.status(400).json({ error: 'Vui lòng nhập số tiền cọc hợp lệ' });
  }
  try {
    const deal = await tx(async (client) => {
      const { rows } = await client.query(
        'SELECT * FROM deals WHERE id = $1 AND sale_id = $2',
        [req.params.id, req.user.id]
      );
      const d = rows[0];
      if (!d) {
        const e = new Error('NOT_FOUND');
        e.statusCode = 404;
        throw e;
      }
      if (d.status !== 'giu_cho') {
        const e = new Error('NOT_HOLD');
        e.statusCode = 400;
        throw e;
      }
      if (!d.property_id) {
        const e = new Error('NO_PROPERTY');
        e.statusCode = 400;
        throw e;
      }
      // Chỉ ưu tiên 1 mới được đặt cọc
      if (d.queue_priority !== 1) {
        const e = new Error('NOT_FIRST_PRIORITY');
        e.statusCode = 400;
        throw e;
      }
      // Khóa căn
      await client.query(`UPDATE properties SET status = 'da_coc' WHERE id = $1`, [d.property_id]);
      // Deal chuyển sang dat_coc (partial unique index đảm bảo không trùng)
      await client.query(
        `UPDATE deals SET status = 'dat_coc', deposit_amount = $1, deposit_at = now(),
                          queue_priority = NULL, updated_at = now()
         WHERE id = $2`,
        [Number(deposit_amount), d.id]
      );
      // Hủy các lượt giữ chỗ còn lại trên cùng căn + hoàn tiền
      const { rows: others } = await client.query(
        `SELECT id, lead_id, hold_amount FROM deals
         WHERE property_id = $1 AND status = 'giu_cho' AND id <> $2`,
        [d.property_id, d.id]
      );
      for (const o of others) {
        await client.query(
          `UPDATE deals SET status = 'huy', cancel_reason = 'Căn đã có người đặt cọc',
                            queue_priority = NULL, updated_at = now() WHERE id = $1`,
          [o.id]
        );
        if (o.hold_amount && Number(o.hold_amount) > 0) {
          const { rows: lr } = await client.query(
            'SELECT full_name FROM leads WHERE id = $1', [o.lead_id]
          );
          const customerName = lr[0]?.full_name || 'khách hàng';
          await client.query(
            `INSERT INTO activities (lead_id, user_id, type, content) VALUES ($1, $2, 'ghi_chu', $3)`,
            [o.lead_id, req.user.id,
             `Hoàn tiền giữ chỗ ${Number(o.hold_amount).toLocaleString('vi-VN')}đ cho khách ${customerName} (căn đã có người đặt cọc)`]
          );
        }
      }
      await client.query(
        `INSERT INTO activities (lead_id, user_id, type, content) VALUES ($1, $2, 'doi_trang_thai', $3)`,
        [d.lead_id, req.user.id,
         `Đặt cọc ${Number(deposit_amount).toLocaleString('vi-VN')}đ, căn đã được khóa`]
      );
      const { rows: out } = await client.query('SELECT * FROM deals WHERE id = $1', [d.id]);
      return out[0];
    });
    res.json(mapDeal(deal));
  } catch (err) {
    if (err.statusCode === 404) return res.status(404).json({ error: 'Không tìm thấy giao dịch' });
    if (err.statusCode === 400) {
      const msgs = {
        NOT_HOLD: 'Chỉ chuyển được giao dịch đang giữ chỗ sang đặt cọc',
        NO_PROPERTY: 'Giao dịch chưa gắn căn, không thể đặt cọc',
        NOT_FIRST_PRIORITY: 'Chỉ lượt giữ chỗ ưu tiên 1 mới được đặt cọc',
      };
      return res.status(400).json({ error: msgs[err.message] || 'Không thể đặt cọc' });
    }
    // Vi phạm unique index chống bán trùng
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Căn đã có giao dịch đặt cọc/ký HĐ khác' });
    }
    console.error('[deals:to-deposit]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// Chốt deal: cập nhật deal + căn (đã bán) + lead (sang Ký HĐ) + thông báo
router.post('/:id/close', async (req, res) => {
  try {
    const deal = await tx(async (client) => {
      const { rows } = await client.query(
        'SELECT * FROM deals WHERE id = $1 AND sale_id = $2',
        [req.params.id, req.user.id]
      );
      const d = rows[0];
      if (!d) {
        const e = new Error('NOT_FOUND');
        e.statusCode = 404;
        throw e;
      }
      if (d.status === 'ky_hd') {
        const e = new Error('ALREADY_CLOSED');
        e.statusCode = 400;
        throw e;
      }
      await client.query(
        `UPDATE deals SET status = 'ky_hd', contract_at = now(), updated_at = now() WHERE id = $1`,
        [d.id]
      );
      // Tự sinh hoa hồng cá nhân theo cấu hình (quy tắc toàn vẹn: qua deal_id → lead + property).
      // Ưu tiên rule khớp: project_id của deal (hoặc null = mọi dự án), type ca_nhan, role sale,
      // status active, còn trong hạn valid_from/valid_to. Không có rule → fallback 3%.
      const existingComm = await client.query(
        'SELECT id FROM commissions WHERE deal_id = $1 LIMIT 1',
        [d.id]
      );
      if (!existingComm.rows[0] && d.agreed_price != null && Number(d.agreed_price) > 0) {
        const dealProjectId = d.property_id
          ? (await client.query('SELECT project_id FROM properties WHERE id = $1', [d.property_id])).rows[0]?.project_id
          : null;
        const ruleRes = await client.query(
          `SELECT rate FROM commission_rules
           WHERE status = 'active'
             AND commission_type = 'ca_nhan'
             AND role = 'sale'
             AND (project_id IS NULL OR project_id = $1)
             AND (valid_from IS NULL OR valid_from <= CURRENT_DATE)
             AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)
           ORDER BY project_id NULLS LAST, created_at DESC
           LIMIT 1`,
          [dealProjectId]
        );
        const rate = ruleRes.rows[0] ? Number(ruleRes.rows[0].rate) : 3.0;
        const amount = Math.round(Number(d.agreed_price) * (rate / 100) * 100) / 100;
        await client.query(
          `INSERT INTO commissions (deal_id, sale_id, team_id, type, rate, amount, status)
           VALUES ($1, $2, $3, 'ca_nhan', $4, $5, 'cho_duyet')`,
          [d.id, d.sale_id, d.team_id || null, rate, amount]
        );
      }
      if (d.property_id) {
        await client.query(`UPDATE properties SET status = 'da_ban' WHERE id = $1`, [d.property_id]);
      }
      await client.query(`UPDATE leads SET status = 'ky_hd', updated_at = now() WHERE id = $1`, [d.lead_id]);
      await client.query(
        `INSERT INTO activities (lead_id, user_id, type, content) VALUES ($1, $2, 'doi_trang_thai', $3)`,
        [d.lead_id, req.user.id, `Chốt giao dịch trị giá ${Number(d.agreed_price).toLocaleString('vi-VN')}đ`]
      );
      await client.query(
        `INSERT INTO notifications (user_id, type, title, body) VALUES ($1, 'deal_approved', $2, $3)`,
        [req.user.id, 'Chúc mừng! Bạn vừa chốt 1 giao dịch',
          `Giá trị ${Number(d.agreed_price).toLocaleString('vi-VN')}đ`]
      );
      const { rows: out } = await client.query('SELECT * FROM deals WHERE id = $1', [d.id]);
      return out[0];
    });
    res.json(mapDeal(deal));
  } catch (err) {
    if (err.statusCode === 404) return res.status(404).json({ error: 'Không tìm thấy giao dịch' });
    if (err.statusCode === 400) return res.status(400).json({ error: 'Giao dịch đã được chốt trước đó' });
    console.error('[deals:close]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

export default router;
