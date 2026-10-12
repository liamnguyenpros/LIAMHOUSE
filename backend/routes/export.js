import { Router } from 'express';
import ExcelJS from 'exceljs';
import { q, mapLead, mapDeal, DEAL_STATUS_TO_API } from '../db.js';
import { auth } from '../middleware/auth.js';

const router = Router();
router.use(auth);

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const LEAD_STATUS_LABELS = {
  moi: 'Mới',
  da_lien_he: 'Đã liên hệ',
  dang_tu_van: 'Đang tư vấn',
  da_dan_xem: 'Đã dẫn xem',
  dat_coc: 'Đặt cọc',
  ky_hd: 'Ký HĐ',
  ban_giao: 'Bàn giao',
  mat: 'Mất',
};

const DEAL_STATUS_LABELS = {
  cho_duyet: 'Chờ duyệt',
  dat_coc: 'Đặt cọc',
  da_chot: 'Đã chốt',
  ban_giao: 'Bàn giao',
  huy: 'Hủy',
};

function fmtDate(v) {
  if (!v) return '';
  const d = new Date(v);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function styleHeader(ws) {
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B2A4A' } };
  header.alignment = { vertical: 'middle' };
  const lastCol = ws.getRow(1).cellCount;
  if (lastCol > 0) {
    ws.autoFilter = {
      from: 'A1',
      to: ws.getCell(1, lastCol).address,
    };
  }
}

async function sendWorkbook(res, wb, filename) {
  const buf = await wb.xlsx.writeBuffer();
  res.setHeader('Content-Type', XLSX_TYPE);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', buf.length);
  res.send(Buffer.from(buf));
}

// Xuất danh sách leads của sale hiện tại ra Excel
router.get('/leads.xlsx', async (req, res) => {
  try {
    const { rows } = await q(
      `SELECT * FROM leads WHERE assigned_to = $1 ORDER BY updated_at DESC`,
      [req.user.id]
    );
    const wb = new ExcelJS.Workbook();
    wb.creator = 'LIAMHOUSE';
    const ws = wb.addWorksheet('Leads');
    ws.columns = [
      { header: 'Họ tên', key: 'full_name', width: 24 },
      { header: 'SĐT', key: 'phone', width: 16 },
      { header: 'Zalo', key: 'zalo', width: 16 },
      { header: 'Nguồn', key: 'source', width: 14 },
      { header: 'Trạng thái', key: 'status', width: 16 },
      { header: 'Điểm', key: 'score', width: 8 },
      { header: 'Ghi chú', key: 'note', width: 32 },
      { header: 'Ngày tạo', key: 'created_at', width: 18 },
    ];
    for (const r of rows) {
      const lead = mapLead(r);
      ws.addRow({
        full_name: lead.full_name,
        phone: lead.phone,
        zalo: lead.zalo || '',
        source: lead.source || '',
        status: LEAD_STATUS_LABELS[lead.status] || lead.status,
        score: lead.score ?? 0,
        note: lead.note || '',
        created_at: fmtDate(lead.created_at),
      });
    }
    styleHeader(ws);
    const stamp = new Date().toISOString().slice(0, 10);
    await sendWorkbook(res, wb, `leads-${stamp}.xlsx`);
  } catch (err) {
    console.error('[export:leads]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// Xuất danh sách deals của sale hiện tại ra Excel
router.get('/deals.xlsx', async (req, res) => {
  try {
    const { rows } = await q(
      `SELECT d.*, l.full_name AS lead_name, l.phone AS lead_phone,
              p.code AS property_code, p.type AS property_type
       FROM deals d
       LEFT JOIN leads l ON l.id = d.lead_id
       LEFT JOIN properties p ON p.id = d.property_id
       WHERE d.sale_id = $1
       ORDER BY d.created_at DESC`,
      [req.user.id]
    );
    const wb = new ExcelJS.Workbook();
    wb.creator = 'LIAMHOUSE';
    const ws = wb.addWorksheet('Deals');
    ws.columns = [
      { header: 'Khách hàng', key: 'lead_name', width: 24 },
      { header: 'SĐT khách', key: 'lead_phone', width: 16 },
      { header: 'Mã căn', key: 'property_code', width: 14 },
      { header: 'Loại căn', key: 'property_type', width: 14 },
      { header: 'Giá thỏa thuận', key: 'agreed_price', width: 18, numFmt: '#,##0' },
      { header: 'Cọc', key: 'deposit_amount', width: 16, numFmt: '#,##0' },
      { header: 'Trạng thái', key: 'status', width: 14 },
      { header: 'Ngày ký HĐ', key: 'contract_at', width: 18 },
      { header: 'Ngày tạo', key: 'created_at', width: 18 },
    ];
    for (const r of rows) {
      const deal = mapDeal(r);
      ws.addRow({
        lead_name: r.lead_name || '',
        lead_phone: r.lead_phone || '',
        property_code: r.property_code || '',
        property_type: r.property_type || '',
        agreed_price: Number(r.agreed_price) || 0,
        deposit_amount: Number(r.deposit_amount) || 0,
        status: DEAL_STATUS_LABELS[deal.status] || deal.status,
        contract_at: fmtDate(r.contract_at),
        created_at: fmtDate(r.created_at),
      });
    }
    styleHeader(ws);
    const stamp = new Date().toISOString().slice(0, 10);
    await sendWorkbook(res, wb, `deals-${stamp}.xlsx`);
  } catch (err) {
    console.error('[export:deals]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

export default router;
