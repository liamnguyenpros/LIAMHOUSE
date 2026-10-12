-- 004-ai-gateway.sql — bảng AI Gateway (credit/quota/usage/extraction).
-- Lý do: schema-v1.sql đã có các bảng này, nhưng server deploy GĐ1 trước 2026-10-10
-- có DB không trống → script bỏ qua schema → thiếu bảng AI → /api/ai/* lỗi 500.
-- Idempotent: chạy lại nhiều lần an toàn (IF NOT EXISTS + ON CONFLICT DO NOTHING).

-- Enum ai_feature (PostgreSQL không hỗ trợ CREATE TYPE IF NOT EXISTS → dùng DO block)
DO $$ BEGIN
  CREATE TYPE ai_feature AS ENUM (
    'quet_namecard','ghi_am_tom_tat','nhap_lieu_giong_noi','parse_tin_nhan',
    'quet_so_do','nhap_excel','doc_van_ban_phap_ly','cham_diem_cuoc_goi',
    'tong_hop_bao_cao','du_bao_goi_y','qa_ask','summarize','lead_parse',
    'voice_stt','report','call_score','forecast','anomaly',
    'ocr_namecard','ocr_redbook'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Bổ sung value còn thiếu nếu enum đã tồn tại từ bản cũ.
-- (Chạy ở top-level, mỗi lệnh là 1 transaction riêng — ADD VALUE cấm chạy trong transaction block/DO.)
ALTER TYPE ai_feature ADD VALUE IF NOT EXISTS 'quet_namecard';
ALTER TYPE ai_feature ADD VALUE IF NOT EXISTS 'ghi_am_tom_tat';
ALTER TYPE ai_feature ADD VALUE IF NOT EXISTS 'nhap_lieu_giong_noi';
ALTER TYPE ai_feature ADD VALUE IF NOT EXISTS 'parse_tin_nhan';
ALTER TYPE ai_feature ADD VALUE IF NOT EXISTS 'quet_so_do';
ALTER TYPE ai_feature ADD VALUE IF NOT EXISTS 'nhap_excel';
ALTER TYPE ai_feature ADD VALUE IF NOT EXISTS 'doc_van_ban_phap_ly';
ALTER TYPE ai_feature ADD VALUE IF NOT EXISTS 'cham_diem_cuoc_goi';
ALTER TYPE ai_feature ADD VALUE IF NOT EXISTS 'tong_hop_bao_cao';
ALTER TYPE ai_feature ADD VALUE IF NOT EXISTS 'du_bao_goi_y';
ALTER TYPE ai_feature ADD VALUE IF NOT EXISTS 'qa_ask';
ALTER TYPE ai_feature ADD VALUE IF NOT EXISTS 'summarize';
ALTER TYPE ai_feature ADD VALUE IF NOT EXISTS 'lead_parse';
ALTER TYPE ai_feature ADD VALUE IF NOT EXISTS 'voice_stt';
ALTER TYPE ai_feature ADD VALUE IF NOT EXISTS 'report';
ALTER TYPE ai_feature ADD VALUE IF NOT EXISTS 'call_score';
ALTER TYPE ai_feature ADD VALUE IF NOT EXISTS 'forecast';
ALTER TYPE ai_feature ADD VALUE IF NOT EXISTS 'anomaly';
ALTER TYPE ai_feature ADD VALUE IF NOT EXISTS 'ocr_namecard';
ALTER TYPE ai_feature ADD VALUE IF NOT EXISTS 'ocr_redbook';

DO $$ BEGIN
  CREATE TYPE ai_source_type AS ENUM ('image','audio','voice_note','message_text','file');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ai_target_type AS ENUM ('lead','property','project','activity','follow_up','document');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE extraction_status AS ENUM ('pending','confirmed','rejected','edited');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- §3.21 — Ví credit AI theo workspace
CREATE TABLE IF NOT EXISTS ai_quotas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces (id),
  period        CHAR(7) NOT NULL,
  credits_total INT NOT NULL DEFAULT 0,
  credits_used  INT NOT NULL DEFAULT 0,
  credits_bonus INT NOT NULL DEFAULT 0,
  status        VARCHAR(16) NOT NULL DEFAULT 'active',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, period)
);

CREATE TABLE IF NOT EXISTS ai_credit_rates (
  ai_feature ai_feature PRIMARY KEY,
  credits    INT NOT NULL,
  note       TEXT
);

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces (id),
  user_id      UUID REFERENCES users (id),
  ai_feature   ai_feature NOT NULL,
  credits      INT NOT NULL DEFAULT 0,
  tokens_used  INT,
  cost_usd     NUMERIC(10,6),
  initiated_by VARCHAR(16) NOT NULL DEFAULT 'user',
  cache_hit    BOOLEAN NOT NULL DEFAULT FALSE,
  ref_type     VARCHAR(64),
  ref_id       UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- §3.22 — Kết quả AI trích xuất chờ user xác nhận
CREATE TABLE IF NOT EXISTS ai_extractions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL,
  user_id        UUID NOT NULL,
  source_type    ai_source_type NOT NULL,
  source_url     VARCHAR(1024),
  ai_feature     ai_feature NOT NULL,
  extracted_data JSONB,
  confidence     NUMERIC(3,2) CHECK (confidence BETWEEN 0 AND 1),
  target_type    ai_target_type NOT NULL,
  target_id      UUID,
  status         extraction_status NOT NULL DEFAULT 'pending',
  reviewed_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_extractions_user ON ai_extractions (user_id, status);

-- Seed bảng giá credit (giữ nguyên nếu đã có)
INSERT INTO ai_credit_rates (ai_feature, credits, note) VALUES
  ('qa_ask',       1,  'Mỗi câu hỏi đáp'),
  ('summarize',    2,  'Tóm tắt chăm sóc / cuộc gọi'),
  ('lead_parse',   2,  'Parse tin nhắn Zalo/FB'),
  ('voice_stt',    3,  'Voice → text, mỗi phút'),
  ('report',       5,  'AI tổng hợp báo cáo'),
  ('call_score',   5,  'Chấm điểm cuộc gọi'),
  ('forecast',     10, 'Dự báo KPI / dòng tiền'),
  ('anomaly',      10, 'Phát hiện thu chi bất thường'),
  ('ocr_namecard', 15, 'Vision'),
  ('ocr_redbook',  15, 'Vision')
ON CONFLICT DO NOTHING;
