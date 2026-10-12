-- 008-kpi-system.sql — Hệ thống chỉ tiêu KPI (kpi_configs) + snapshot định kỳ (kpi_snapshots)
-- Chạy idempotent: dùng IF NOT EXISTS / DO block

-- 1. Enums
DO $$ BEGIN
  CREATE TYPE kpi_config_role AS ENUM ('sale', 'truong_phong');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE kpi_metric AS ENUM ('calls','leads_new','viewings','holds','deposits','deals_closed','revenue');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE kpi_period_type AS ENUM ('day','week','month');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE kpi_snapshot_status AS ENUM ('dat','canh_bao','nguy_hiem');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Bảng kpi_configs — định nghĩa chỉ tiêu KPI (§3.15)
CREATE TABLE IF NOT EXISTS kpi_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  role kpi_config_role,
  metric kpi_metric NOT NULL,
  target_value NUMERIC(18,2) NOT NULL DEFAULT 0,
  period_type kpi_period_type NOT NULL DEFAULT 'month',
  warning_threshold NUMERIC(5,2) NOT NULL DEFAULT 70,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kpi_configs_ws ON kpi_configs(workspace_id, is_active);
CREATE INDEX IF NOT EXISTS idx_kpi_configs_team ON kpi_configs(team_id) WHERE team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kpi_configs_lookup
  ON kpi_configs(workspace_id, metric, period_type) WHERE is_active = true;

-- 3. Bảng kpi_snapshots — chụp số liệu KPI định kỳ (§3.16)
CREATE TABLE IF NOT EXISTS kpi_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  kpi_config_id UUID REFERENCES kpi_configs(id) ON DELETE SET NULL,
  metric kpi_metric NOT NULL,
  period_type kpi_period_type NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE,
  actual_value NUMERIC(18,2) NOT NULL DEFAULT 0,
  target_value NUMERIC(18,2) NOT NULL DEFAULT 0,
  achievement_rate NUMERIC(7,2),
  status kpi_snapshot_status,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_kpi_snapshot_period UNIQUE (workspace_id, user_id, metric, period_type, period_start)
);

CREATE INDEX IF NOT EXISTS idx_kpi_snapshots_user
  ON kpi_snapshots(workspace_id, user_id, metric, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_kpi_snapshots_alert
  ON kpi_snapshots(status, created_at)
  WHERE status IN ('canh_bao','nguy_hiem');

-- 4. Trigger updated_at cho kpi_configs (chỉ khi hàm set_updated_at() tồn tại)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at')
     AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_kpi_configs_updated_at') THEN
    CREATE TRIGGER trg_kpi_configs_updated_at
      BEFORE UPDATE ON kpi_configs
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;
