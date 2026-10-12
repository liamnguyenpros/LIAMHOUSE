-- Migration 002: T1 full features — call logs, KPI targets, project dossiers
-- Ngày: 2026-10-09

-- 1. Nhật ký cuộc gọi (gắn với lead, phục vụ coaching & KPI)
CREATE TABLE IF NOT EXISTS call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  called_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_sec INT NOT NULL DEFAULT 0,
  outcome VARCHAR(32) NOT NULL DEFAULT 'không_nghe_may',
  -- outcome: thanh_cong | khong_nghe_may | may_ban | tu_choi | hen_lai | sai_so
  recording_url TEXT,
  ai_score INT CHECK (ai_score IS NULL OR (ai_score >= 0 AND ai_score <= 100)),
  ai_summary TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_call_logs_lead ON call_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_user ON call_logs(user_id, called_at DESC);

-- 2. Chỉ tiêu KPI cá nhân (theo tuần / tháng)
CREATE TABLE IF NOT EXISTS kpi_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  metric VARCHAR(32) NOT NULL,
  -- metric: cuoc_goi | lich_hen | lead_moi | deal_chot | doanh_so
  period VARCHAR(16) NOT NULL DEFAULT 'thang',
  -- period: tuan | thang
  target_value NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, user_id, metric, period)
);

-- 3. Hồ sơ dự án (pháp lý / mặt bằng / tiến độ)
CREATE TABLE IF NOT EXISTS project_docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  doc_type VARCHAR(32) NOT NULL,
  -- doc_type: phap_ly | mat_bang | tien_do | hop_dong_mau | khac
  title VARCHAR(255) NOT NULL,
  description TEXT,
  file_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_project_docs_project ON project_docs(project_id, doc_type);
