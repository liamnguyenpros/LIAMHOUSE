/**
 * Context Builder — LiamHouse AI Gateway
 *
 * Build tóm tắt dữ liệu thật của user để inject vào system prompt
 * cho feature qa_ask. Mọi query đều filter theo workspace_id + user_id.
 */
import { q, VN_TODAY } from '../db.js';

// Số thực tế cho 1 metric KPI trong tháng hiện tại (logic rút gọn từ routes/kpis.js)
async function kpiActual(metric, userId, workspaceId) {
  const from = `date_trunc('month', ${VN_TODAY})`;
  const to = `${VN_TODAY} + interval '1 day'`;
  switch (metric) {
    case 'cuoc_goi': {
      const { rows } = await q(
        `SELECT COUNT(*)::int AS v FROM call_logs
         WHERE user_id = $1 AND workspace_id = $2 AND called_at >= ${from} AND called_at < ${to}`,
        [userId, workspaceId]
      );
      return rows[0].v;
    }
    case 'lead_moi': {
      const { rows } = await q(
        `SELECT COUNT(*)::int AS v FROM leads
         WHERE assigned_to = $1 AND created_at >= ${from} AND created_at < ${to}`,
        [userId]
      );
      return rows[0].v;
    }
    case 'deal_chot': {
      const { rows } = await q(
        `SELECT COUNT(*)::int AS v FROM deals
         WHERE sale_id = $1 AND status IN ('ky_hd', 'ban_giao')
           AND COALESCE(contract_at, created_at) >= ${from} AND COALESCE(contract_at, created_at) < ${to}`,
        [userId]
      );
      return rows[0].v;
    }
    case 'doanh_so': {
      const { rows } = await q(
        `SELECT COALESCE(SUM(agreed_price), 0)::numeric AS v FROM deals
         WHERE sale_id = $1 AND status IN ('ky_hd', 'ban_giao')
           AND COALESCE(contract_at, created_at) >= ${from} AND COALESCE(contract_at, created_at) < ${to}`,
        [userId]
      );
      return Number(rows[0].v);
    }
    default:
      return 0;
  }
}

/**
 * Build context tóm tắt cho Q&A.
 * @returns {Promise<object>} object JSON-serializable để nhúng vào system prompt
 */
export async function buildQaContext(workspaceId, userId) {
  const ctx = { generated_at: new Date().toISOString() };

  // ---- Leads ----
  const leadStats = await q(
    `SELECT
       COUNT(*)::int AS tong,
       COUNT(*) FILTER (WHERE created_at >= ${VN_TODAY})::int AS moi_hom_nay,
       COUNT(*) FILTER (WHERE status = 'moi')::int AS chua_lien_he
     FROM leads
     WHERE assigned_to = $1`,
    [userId]
  );
  ctx.leads = {
    tong_so: leadStats.rows[0].tong,
    moi_hom_nay: leadStats.rows[0].moi_hom_nay,
    chua_lien_he: leadStats.rows[0].chua_lien_he,
  };

  // Top 5 lead cần chăm sóc: có follow-up quá hạn hoặc đến hạn hôm nay
  const needCare = await q(
    `SELECT DISTINCT ON (l.id) l.id, l.full_name, l.phone, l.status,
            f.title AS viec_can_lam, f.due_at
     FROM leads l
     JOIN follow_ups f ON f.lead_id = l.id
     WHERE l.assigned_to = $1
       AND f.status IN ('pending', 'overdue')
       AND f.due_at < (${VN_TODAY} + interval '1 day')
     ORDER BY l.id, f.due_at ASC
     LIMIT 5`,
    [userId]
  );
  ctx.leads.can_cham_soc_gap = needCare.rows.map((r) => ({
    ten: r.full_name,
    sdt: r.phone,
    trang_thai: r.status,
    viec: r.viec_can_lam,
    han: r.due_at,
  }));

  // ---- Follow-ups ----
  const fuStats = await q(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'pending' AND due_at >= ${VN_TODAY}
                        AND due_at < (${VN_TODAY} + interval '1 day'))::int AS den_han_hom_nay,
       COUNT(*) FILTER (WHERE status IN ('pending', 'overdue')
                        AND due_at < ${VN_TODAY})::int AS qua_han
     FROM follow_ups
     WHERE assigned_to = $1`,
    [userId]
  );
  ctx.follow_ups = {
    den_han_hom_nay: fuStats.rows[0].den_han_hom_nay,
    qua_han: fuStats.rows[0].qua_han,
  };

  // ---- Deals ----
  const dealStats = await q(
    `SELECT
       COUNT(*) FILTER (WHERE COALESCE(contract_at, created_at) >= date_trunc('month', ${VN_TODAY}))::int AS so_deal_thang_nay,
       COALESCE(SUM(agreed_price) FILTER (WHERE status IN ('ky_hd', 'ban_giao')
         AND COALESCE(contract_at, created_at) >= date_trunc('month', ${VN_TODAY})), 0)::numeric AS doanh_so_thang
     FROM deals
     WHERE sale_id = $1`,
    [userId]
  );
  const dealByStage = await q(
    `SELECT status, COUNT(*)::int AS so_luong
     FROM deals
     WHERE sale_id = $1 AND status NOT IN ('huy')
     GROUP BY status`,
    [userId]
  );
  ctx.deals = {
    so_deal_thang_nay: dealStats.rows[0].so_deal_thang_nay,
    doanh_so_thang_vnd: Number(dealStats.rows[0].doanh_so_thang),
    theo_giai_doan: Object.fromEntries(dealByStage.rows.map((r) => [r.status, r.so_luong])),
  };

  // ---- KPIs (chỉ tiêu tháng + thực tế) ----
  const { rows: targets } = await q(
    `SELECT metric, target_value FROM kpi_targets
     WHERE user_id = $1 AND workspace_id = $2 AND period = 'thang'`,
    [userId, workspaceId]
  );
  ctx.kpis_thang = [];
  for (const t of targets) {
    const actual = await kpiActual(t.metric, userId, workspaceId);
    const target = Number(t.target_value);
    ctx.kpis_thang.push({
      chi_tieu: t.metric,
      muc_tieu: target,
      thuc_te: actual,
      phan_tram: target > 0 ? Math.round((Number(actual) / target) * 1000) / 10 : null,
    });
  }

  // ---- Cuộc gọi 7 ngày qua ----
  const callStats = await q(
    `SELECT
       COUNT(*)::int AS tong_cuoc_goi,
       COUNT(*) FILTER (WHERE outcome = 'thanh_cong')::int AS thanh_cong,
       COALESCE(SUM(duration_sec), 0)::int AS tong_giay
     FROM call_logs
     WHERE user_id = $1 AND workspace_id = $2
       AND called_at >= (${VN_TODAY} - interval '7 days')`,
    [userId, workspaceId]
  );
  const cs = callStats.rows[0];
  ctx.cuoc_goi_7_ngay = {
    tong: cs.tong_cuoc_goi,
    thanh_cong: cs.thanh_cong,
    ty_le_thanh_cong_phan_tram:
      cs.tong_cuoc_goi > 0 ? Math.round((cs.thanh_cong / cs.tong_cuoc_goi) * 1000) / 10 : 0,
    tong_phut: Math.round((cs.tong_giay / 60) * 10) / 10,
  };

  return ctx;
}

/**
 * Tạo system prompt tiếng Việt cho qa_ask từ context.
 */
export function buildQaSystemPrompt(ctx) {
  return (
    'Bạn là trợ lý AI của sale bất động sản trong app LiamHouse. ' +
    'Hãy trả lời ngắn gọn, thực tế, dùng số liệu dưới đây. ' +
    'Nếu câu hỏi ngoài phạm vi dữ liệu, nói rõ là không có dữ liệu.\n\n' +
    'Dữ liệu hiện tại của user:\n' +
    JSON.stringify(ctx, null, 1)
  );
}
