-- 007-pricing-commission-rules.sql — Chính sách giá & Cấu hình hoa hồng (data model §3.11, §3.13).
-- Idempotent: chạy lại nhiều lần an toàn (DO block + IF NOT EXISTS).

-- Enum rule_role: sale / truong_phong / giam_doc_san
DO $$ BEGIN
  CREATE TYPE rule_role AS ENUM ('sale', 'truong_phong', 'giam_doc_san');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE rule_role ADD VALUE IF NOT EXISTS 'sale';
ALTER TYPE rule_role ADD VALUE IF NOT EXISTS 'truong_phong';
ALTER TYPE rule_role ADD VALUE IF NOT EXISTS 'giam_doc_san';

-- Enum rule_status: active / expired / draft
DO $$ BEGIN
  CREATE TYPE rule_status AS ENUM ('active', 'expired', 'draft');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE rule_status ADD VALUE IF NOT EXISTS 'active';
ALTER TYPE rule_status ADD VALUE IF NOT EXISTS 'expired';
ALTER TYPE rule_status ADD VALUE IF NOT EXISTS 'draft';

-- Bảng price_policies — Chính sách giá & khuyến mãi theo dự án (§3.11)
CREATE TABLE IF NOT EXISTS price_policies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,                  -- VD: "Chính sách tháng 10 – CK 3%"
  discount_rate NUMERIC(5,2),                            -- tỷ lệ chiết khấu %
  gift          TEXT,                                   -- quà tặng kèm
  valid_from    DATE,
  valid_to      DATE,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_policies_project ON price_policies (project_id);
CREATE INDEX IF NOT EXISTS idx_price_policies_valid   ON price_policies (valid_from, valid_to);

DO $$ BEGIN
  CREATE TRIGGER trg_price_policies_updated_at BEFORE UPDATE ON price_policies
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Bảng commission_rules — Cấu hình tỷ lệ hoa hồng (§3.13)
CREATE TABLE IF NOT EXISTS commission_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(255) NOT NULL,                -- VD: "Chính sách HH Q4/2026 – Vinhomes"
  project_id      UUID REFERENCES projects(id) ON DELETE CASCADE,  -- null = mọi dự án
  role            rule_role NOT NULL DEFAULT 'sale',
  commission_type commission_type NOT NULL DEFAULT 'ca_nhan',
  rate            NUMERIC(5,2) NOT NULL DEFAULT 3.00,   -- tỷ lệ %
  min_deals       NUMERIC,                              -- ngưỡng số deal kích hoạt (thang thưởng)
  min_revenue     NUMERIC(18,2),                        -- ngưỡng doanh số kích hoạt
  valid_from      DATE,
  valid_to        DATE,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  status          rule_status NOT NULL DEFAULT 'active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commission_rules_project ON commission_rules (project_id);
CREATE INDEX IF NOT EXISTS idx_commission_rules_lookup ON commission_rules (role, commission_type, status);
CREATE INDEX IF NOT EXISTS idx_commission_rules_valid  ON commission_rules (valid_from, valid_to);

DO $$ BEGIN
  CREATE TRIGGER trg_commission_rules_updated_at BEFORE UPDATE ON commission_rules
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
