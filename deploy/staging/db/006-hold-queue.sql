-- 006-hold-queue.sql — Hàng đợi giữ chỗ + chống bán trùng căn
-- Chạy idempotent: dùng IF NOT EXISTS

-- 1. Ràng buộc chống bán trùng: chỉ cho phép 1 deal ở trạng thái
--    dat_coc / ky_hd / ban_giao trên mỗi property (partial unique index).
--    Nhiều deal giu_cho trên cùng căn vẫn được phép (hàng đợi).
CREATE UNIQUE INDEX IF NOT EXISTS uq_deals_property_active
  ON deals(property_id)
  WHERE status IN ('dat_coc', 'ky_hd', 'ban_giao')
    AND property_id IS NOT NULL;

-- 2. Index cho hàng đợi giữ chỗ: tra cứu nhanh các lượt giu_cho của 1 căn
--    theo thứ tự ưu tiên.
CREATE INDEX IF NOT EXISTS idx_deals_property_queue
  ON deals(property_id, queue_priority)
  WHERE status = 'giu_cho';
