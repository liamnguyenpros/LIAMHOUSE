-- 005-commissions.sql — Hệ thống Hoa hồng tầng 1 (data model §3.10).
-- Idempotent: chạy lại nhiều lần an toàn (DO block + IF NOT EXISTS).

-- Enum commission_type (PostgreSQL không hỗ trợ CREATE TYPE IF NOT EXISTS → dùng DO block)
DO $$ BEGIN
  CREATE TYPE commission_type AS ENUM ('ca_nhan', 'doi_nhom');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE commission_type ADD VALUE IF NOT EXISTS 'ca_nhan';
ALTER TYPE commission_type ADD VALUE IF NOT EXISTS 'doi_nhom';

-- Enum commission_status
DO $$ BEGIN
  CREATE TYPE commission_status AS ENUM ('cho_duyet', 'da_duyet', 'da_chi');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE commission_status ADD VALUE IF NOT EXISTS 'cho_duyet';
ALTER TYPE commission_status ADD VALUE IF NOT EXISTS 'da_duyet';
ALTER TYPE commission_status ADD VALUE IF NOT EXISTS 'da_chi';

-- Bảng commissions
CREATE TABLE IF NOT EXISTS commissions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id      UUID NOT NULL REFERENCES deals(id) ON DELETE RESTRICT,
  sale_id      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,  -- người hưởng
  team_id      UUID,                                                   -- nullable, team nguồn khi doi_nhom
  type         commission_type NOT NULL DEFAULT 'ca_nhan',
  rate         NUMERIC(5,2),                                           -- tỷ lệ % tại thời điểm tính
  amount       NUMERIC(18,2) NOT NULL DEFAULT 0,                       -- số tiền
  status       commission_status NOT NULL DEFAULT 'cho_duyet',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commissions_deal    ON commissions (deal_id);
CREATE INDEX IF NOT EXISTS idx_commissions_sale    ON commissions (sale_id, status);
CREATE INDEX IF NOT EXISTS idx_commissions_team    ON commissions (team_id);
CREATE INDEX IF NOT EXISTS idx_commissions_status  ON commissions (status);

-- Trigger tự cập nhật updated_at
DO $$ BEGIN
  CREATE TRIGGER trg_commissions_updated_at BEFORE UPDATE ON commissions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
