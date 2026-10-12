-- Migration 003: Smart matching + Lịch thanh toán theo đợt
-- Ngày: 2026-10-09

-- 1. Lịch thanh toán theo đợt cho từng deal
CREATE TABLE IF NOT EXISTS payment_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  dot_number INT NOT NULL,              -- đợt 1, 2, 3...
  label VARCHAR(255),                   -- VD: "Đặt cọc", "Đợt 1 - Ký HĐ", "Đợt 2..."
  due_date DATE NOT NULL,                -- ngày đến hạn
  amount NUMERIC(18,2) NOT NULL,         -- số tiền phải trả đợt này
  paid_amount NUMERIC(18,2) NOT NULL DEFAULT 0,  -- đã trả
  status VARCHAR(32) NOT NULL DEFAULT 'chua_den_han',
  -- status: chua_den_han | sap_den_han | qua_han | da_thanh_toan | thanh_toan_mot_phan
  note TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (deal_id, dot_number)
);
CREATE INDEX IF NOT EXISTS idx_payment_schedules_deal ON payment_schedules(deal_id, dot_number);
CREATE INDEX IF NOT EXISTS idx_payment_schedules_due ON payment_schedules(workspace_id, due_date, status);

-- 2. Mở rộng leads.demand: thêm diện tích mong muốn (nếu chưa có trong JSON)
-- demand JSONB chuẩn: {loai, khu_vuc, ngan_sach_min, ngan_sach_max, dien_tich_min, dien_tich_max, muc_dich, ghi_chu}
-- Không cần đổi schema, chỉ quy ước trong code.
