import { Router } from 'express';
import { q, VN_TODAY, VN_MONTH } from '../db.js';
import { auth } from '../middleware/auth.js';

const router = Router();
router.use(auth);

router.get('/summary', async (req, res) => {
  const uid = req.user.id;
  try {
    const leadsMoi = (await q(
      `SELECT COUNT(*)::int c FROM leads WHERE assigned_to = $1 AND status = 'moi' AND created_at::date = ${VN_TODAY}`,
      [uid]
    )).rows[0].c;

    const fuDenHan = (await q(
      `SELECT COUNT(*)::int c FROM follow_ups WHERE assigned_to = $1 AND status = 'pending' AND due_at::date = ${VN_TODAY}`,
      [uid]
    )).rows[0].c;

    const fuQuaHan = (await q(
      `SELECT COUNT(*)::int c FROM follow_ups WHERE assigned_to = $1 AND status = 'pending' AND due_at::date < ${VN_TODAY}`,
      [uid]
    )).rows[0].c;

    const dealsThang = (await q(
      `SELECT COUNT(*)::int c FROM deals
       WHERE sale_id = $1 AND status = 'ky_hd'
         AND to_char(contract_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM') = ${VN_MONTH}`,
      [uid]
    )).rows[0].c;

    const doanhSo = (await q(
      `SELECT COALESCE(SUM(agreed_price), 0) s FROM deals
       WHERE sale_id = $1 AND status = 'ky_hd'
         AND to_char(contract_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM') = ${VN_MONTH}`,
      [uid]
    )).rows[0].s;

    const fuHomNay = (await q(
      `SELECT f.*, l.full_name AS lead_name
       FROM follow_ups f JOIN leads l ON l.id = f.lead_id
       WHERE f.assigned_to = $1 AND f.status = 'pending' AND f.due_at::date = ${VN_TODAY}
       ORDER BY f.due_at ASC LIMIT 10`,
      [uid]
    )).rows;

    res.json({
      leads_moi_hom_nay: leadsMoi,
      followup_den_han: fuDenHan,
      followup_qua_han: fuQuaHan,
      deals_thang: dealsThang,
      doanh_so_thang: Number(doanhSo),
      followup_hom_nay: fuHomNay,
    });
  } catch (err) {
    console.error('[dashboard:summary]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

export default router;
