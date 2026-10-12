import { Router } from 'express';
import { q } from '../db.js';
import { auth } from '../middleware/auth.js';

const router = Router();
router.use(auth);

// Parse ngân sách từ demand.
// Hỗ trợ format mới {ngan_sach_min, ngan_sach_max} (số) và format cũ {ngan_sach: "2-3 tỷ"}.
function parseBudget(demand) {
  let min = null;
  let max = null;
  if (demand.ngan_sach_min != null && demand.ngan_sach_min !== '') {
    const v = Number(demand.ngan_sach_min);
    if (!Number.isNaN(v)) min = v;
  }
  if (demand.ngan_sach_max != null && demand.ngan_sach_max !== '') {
    const v = Number(demand.ngan_sach_max);
    if (!Number.isNaN(v)) max = v;
  }
  if ((min == null || max == null) && typeof demand.ngan_sach === 'string') {
    const s = demand.ngan_sach.toLowerCase().replace(/,/g, '.');
    const unit = s.includes('tỷ') ? 1e9 : /triệu|trieu/.test(s) ? 1e6 : null;
    if (unit) {
      const nums = (s.match(/[\d.]+/g) || []).map(Number).filter((n) => !Number.isNaN(n));
      if (nums.length >= 2) {
        if (min == null) min = nums[0] * unit;
        if (max == null) max = nums[1] * unit;
      } else if (nums.length === 1 && max == null) {
        max = nums[0] * unit;
      }
    }
  }
  return { min, max };
}

// Chấm điểm khớp 0-100 + lý do. Thiếu tiêu chí nào thì bỏ qua và chuẩn hóa lại theo trọng số còn lại.
function scoreProperty(prop, demand, projectName, projectLocation) {
  let gained = 0;
  let totalW = 0;
  const reasons = [];

  const { min: budgetMin, max: budgetMax } = parseBudget(demand);
  const price = Number(prop.price);

  // 1. Giá trong ngân sách: 40đ
  if (budgetMin != null || budgetMax != null) {
    totalW += 40;
    const ok =
      (budgetMin == null || price >= budgetMin) &&
      (budgetMax == null || price <= budgetMax);
    if (ok) {
      gained += 40;
      reasons.push('Giá trong ngân sách');
    }
  }

  // 2. Đúng loại hình: 20đ
  if (demand.loai) {
    totalW += 20;
    if (prop.type === demand.loai) {
      gained += 20;
      reasons.push('Đúng loại hình');
    }
  }

  // 3. Diện tích phù hợp: 20đ
  const areaMin = demand.dien_tich_min != null && demand.dien_tich_min !== '' ? Number(demand.dien_tich_min) : null;
  const areaMax = demand.dien_tich_max != null && demand.dien_tich_max !== '' ? Number(demand.dien_tich_max) : null;
  if ((areaMin != null && !Number.isNaN(areaMin)) || (areaMax != null && !Number.isNaN(areaMax))) {
    totalW += 20;
    const area = Number(prop.area);
    const ok =
      (areaMin == null || Number.isNaN(areaMin) || area >= areaMin) &&
      (areaMax == null || Number.isNaN(areaMax) || area <= areaMax);
    if (ok) {
      gained += 20;
      reasons.push('Diện tích phù hợp');
    }
  }

  // 4. Khu vực: 10đ (khớp tên dự án hoặc địa chỉ chứa từ khóa khu_vuc)
  if (demand.khu_vuc && String(demand.khu_vuc).trim()) {
    totalW += 10;
    const kv = String(demand.khu_vuc).toLowerCase().trim();
    const hay = `${projectName || ''} ${projectLocation || ''}`.toLowerCase();
    const words = kv.split(/\s+/).filter((w) => w.length > 1);
    if (hay.includes(kv) || words.some((w) => hay.includes(w))) {
      gained += 10;
      reasons.push('Đúng khu vực quan tâm');
    }
  }

  // 5. Còn hàng: 10đ (luôn đúng vì đã lọc status='trong')
  totalW += 10;
  gained += 10;
  reasons.push('Còn hàng');

  const score = totalW > 0 ? Math.round((gained / totalW) * 100) : 0;
  return { score, reasons };
}

// GET /matching/leads/:leadId/properties — gợi ý BĐS khớp nhu cầu
router.get('/leads/:leadId/properties', async (req, res) => {
  try {
    const leadRes = await q(
      'SELECT id, full_name, demand FROM leads WHERE id = $1 AND assigned_to = $2',
      [req.params.leadId, req.user.id]
    );
    const lead = leadRes.rows[0];
    if (!lead) return res.status(404).json({ error: 'Không tìm thấy lead' });

    const demand = lead.demand || {};
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));

    const { rows: props } = await q(
      `SELECT p.*, pr.name AS project_name, pr.location AS project_location
       FROM properties p
       JOIN projects pr ON pr.id = p.project_id
       WHERE p.status = 'trong'
       ORDER BY p.price ASC
       LIMIT $1`,
      [limit * 4] // lấy dư để chấm điểm rồi cắt top
    );

    const scored = props
      .map((p) => {
        const { score, reasons } = scoreProperty(p, demand, p.project_name, p.project_location);
        const { project_name, project_location, ...property } = p;
        return { property, project_name, match_score: score, match_reasons: reasons };
      })
      .sort((a, b) => b.match_score - a.match_score)
      .slice(0, limit);

    res.json({
      lead_id: lead.id,
      lead_name: lead.full_name,
      demand,
      total: scored.length,
      data: scored,
    });
  } catch (err) {
    console.error('[matching:properties]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

export default router;
