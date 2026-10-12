-- 009-call-campaigns.sql — Chiến dịch gọi tự động + Tích hợp tổng đài (data model §3.18, §3.19).
-- Idempotent: chạy lại nhiều lần an toàn (DO block + IF NOT EXISTS).

-- Enum campaign_status (PostgreSQL không hỗ trợ CREATE TYPE IF NOT EXISTS → dùng DO block)
DO $$ BEGIN
  CREATE TYPE campaign_status AS ENUM ('draft', 'running', 'done', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE campaign_status ADD VALUE IF NOT EXISTS 'draft';
ALTER TYPE campaign_status ADD VALUE IF NOT EXISTS 'running';
ALTER TYPE campaign_status ADD VALUE IF NOT EXISTS 'done';
ALTER TYPE campaign_status ADD VALUE IF NOT EXISTS 'cancelled';

-- Bảng call_campaigns
CREATE TABLE IF NOT EXISTS call_campaigns (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  team_id      UUID REFERENCES teams(id) ON DELETE SET NULL,  -- null = cả workspace
  name         VARCHAR(255) NOT NULL,
  created_by   UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  lead_filter  JSONB NOT NULL DEFAULT '{}',                   -- {status, created_before, ...}
  assigned_to  UUID REFERENCES users(id) ON DELETE SET NULL, -- giao cho sale cụ thể (null = chia đều)
  schedule_at  TIMESTAMPTZ,                                   -- hẹn giờ chạy
  status       campaign_status NOT NULL DEFAULT 'draft',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_campaigns_workspace ON call_campaigns(workspace_id);
CREATE INDEX IF NOT EXISTS idx_call_campaigns_status   ON call_campaigns(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_call_campaigns_assigned ON call_campaigns(assigned_to);

DROP TRIGGER IF EXISTS trg_call_campaigns_updated_at ON call_campaigns;
CREATE TRIGGER trg_call_campaigns_updated_at BEFORE UPDATE ON call_campaigns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Bảng workspace_integrations
CREATE TABLE IF NOT EXISTS workspace_integrations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider          VARCHAR(50) NOT NULL,                     -- 'stringee' | 'vht' | 'custom'
  api_key_encrypted VARCHAR(1024) NOT NULL,                   -- mã hóa (base64 + prefix, xem routes/integrations.js)
  settings          JSONB NOT NULL DEFAULT '{}',              -- {hotline, record, ...}
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_by        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_integrations_ws ON workspace_integrations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_integrations_provider ON workspace_integrations(workspace_id, provider);

DROP TRIGGER IF EXISTS trg_workspace_integrations_updated_at ON workspace_integrations;
CREATE TRIGGER trg_workspace_integrations_updated_at BEFORE UPDATE ON workspace_integrations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
