-- ============================================================
-- LIAMHOUSE — Migration v1 (BẢN NHÁP, chưa chạy)
-- Nguồn: ~/workspace/phac-thao-data-model-liamhouse.md
--   §3.0 workspaces · §3.1 users · §3.2 teams · §3.3 leads
--   §3.4 follow_ups · §3.5 activities · §3.6 projects
--   §3.7 properties · §3.8 documents · §3.9 deals
--   §3.14 notifications · §3.20 ai_extractions · §3.21 ai_quotas/ai_credit_rates/ai_usage_logs
-- Phạm vi: phục vụ GĐ0 "migration đầu tiên chạy được" + GĐ1 (T1 backend)
--   GĐ3 bổ sung: commissions, commission_rules, kpi_configs,
--                kpi_snapshots, call_logs, call_campaigns, workspace_integrations
--   GĐ4 bổ sung: transactions, debts, payrolls, misa_connections, misa_sync_logs,
--                price_policies
--   (ai_quotas, ai_credit_rates, ai_usage_logs thuộc GĐ1 theo quyết định quota credit 2026-10-09)
-- Quyết định demo đã đồng bộ:
--   · Hàng đợi giữ chỗ: nhiều lượt giu_cho trên 1 căn được phép (ưu tiên 1,2,3...);
--     "1 căn – 1 khách" chỉ khóa từ dat_coc trở đi (§3.7 bổ sung 2026-10-07)
--   · Doanh số chỉ cộng deal đã ký HĐ (ky_hd/ban_giao) (§3.9)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ================= ENUMS =================
CREATE TYPE workspace_type    AS ENUM ('solo', 'org');
CREATE TYPE plan_type          AS ENUM ('free_trial', 'ca_nhan', 'team', 'san', 'doanh_nghiep');
CREATE TYPE user_role          AS ENUM ('sale', 'truong_phong', 'giam_doc_san', 'gd_kinh_doanh', 'admin');
CREATE TYPE user_status        AS ENUM ('active', 'inactive', 'pending');
CREATE TYPE team_status        AS ENUM ('active', 'disbanded');
CREATE TYPE lead_source        AS ENUM ('facebook', 'tiktok', 'referral', 'walk_in', 'website', 'data_mua', 'khac');
CREATE TYPE lead_status        AS ENUM ('moi', 'da_lien_he', 'dang_tu_van', 'da_dan_xem', 'dat_coc', 'ky_hd', 'ban_giao', 'mat');
CREATE TYPE followup_type      AS ENUM ('goi_dien', 'nhan_tin', 'hen_gap', 'gui_tai_lieu', 'sinh_nhat', 'khac');
CREATE TYPE followup_status    AS ENUM ('pending', 'done', 'overdue', 'skipped');
CREATE TYPE activity_type      AS ENUM ('goi_dien', 'zalo', 'gap_mat', 'dan_xem_nha', 'gui_bao_gia', 'ghi_chu', 'doi_trang_thai');
-- THÊM GĐ1: 'doi_trang_thai' (log tự động khi đổi bước pipeline / chốt deal) — API contract T1 dùng.
CREATE TYPE legal_status       AS ENUM ('day_du', 'dang_hoan_thien', 'rui_ro');
CREATE TYPE project_status     AS ENUM ('dang_ban', 'sap_mo_ban', 'ngung_ban');
CREATE TYPE property_type      AS ENUM ('can_ho', 'shophouse', 'dat_nen', 'nha_pho', 'biet_thu');
CREATE TYPE property_status    AS ENUM ('trong', 'giu_cho', 'da_coc', 'da_ban');
CREATE TYPE doc_owner_type     AS ENUM ('project', 'property');
CREATE TYPE doc_type           AS ENUM ('so_do', 'giay_phep_xd', 'quy_hoach_1_500', 'hd_mua_ban_mau', 'bang_tien_do', 'chinh_sach_ban_hang', 'khac');
CREATE TYPE deal_status        AS ENUM ('giu_cho', 'dat_coc', 'ky_hd', 'ban_giao', 'huy');
CREATE TYPE notification_type  AS ENUM ('follow_up_overdue', 'lead_assigned', 'deal_approved', 'commission_paid', 'price_change', 'kpi_warning', 'kpi_critical', 'manager_nudge', 'call_campaign_done');
CREATE TYPE ai_source_type     AS ENUM ('image', 'audio', 'voice_note', 'message_text', 'file');
CREATE TYPE ai_target_type     AS ENUM ('lead', 'property', 'project', 'activity', 'follow_up', 'document');
CREATE TYPE extraction_status  AS ENUM ('pending', 'confirmed', 'rejected', 'edited');
CREATE TYPE ai_feature         AS ENUM ('quet_namecard', 'ghi_am_tom_tat', 'nhap_lieu_giong_noi', 'parse_tin_nhan', 'quet_so_do', 'nhap_excel', 'doc_van_ban_phap_ly', 'cham_diem_cuoc_goi', 'tong_hop_bao_cao', 'du_bao_goi_y', 'qa_ask', 'summarize', 'lead_parse', 'voice_stt', 'report', 'call_score', 'forecast', 'anomaly', 'ocr_namecard', 'ocr_redbook');
-- GHI CHÚ enum ai_feature: chứa 2 bộ key — tên tính năng §3.22 (quet_namecard...)
-- dùng cho ai_extractions, và key billing §3.21 (qa_ask, summarize...) dùng cho
-- ai_credit_rates/ai_usage_logs. AI Gateway chuẩn hóa về key §3.21 khi trừ credit.

-- Trigger tự cập nhật updated_at
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ================= TABLES =================

-- §3.0 — Không gian làm việc (solo / org)
CREATE TABLE workspaces (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(255) NOT NULL,
  type       workspace_type NOT NULL DEFAULT 'solo',
  owner_id   UUID,                       -- FK → users(id), thêm sau (vòng tham chiếu)
  plan       plan_type NOT NULL DEFAULT 'free_trial',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- §3.1 — Người dùng & phân quyền
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL,            -- FK → workspaces
  full_name     VARCHAR(255) NOT NULL,
  phone         VARCHAR(32) NOT NULL UNIQUE,  -- SĐT = tài khoản đăng nhập
  password_hash VARCHAR(255) NOT NULL,
  role          user_role NOT NULL DEFAULT 'sale',
  team_id       UUID,                     -- FK → teams, null nếu là GĐ
  manager_id    UUID,                     -- FK → users, quản lý trực tiếp
  status        user_status NOT NULL DEFAULT 'active',
  avatar_url    VARCHAR(1024),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- §3.2 — Đội nhóm kinh doanh
CREATE TABLE teams (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           VARCHAR(255) NOT NULL,
  leader_id      UUID,                    -- FK → users (trưởng phòng)
  parent_team_id UUID,                    -- FK → teams, team cha (GĐ sàn quản đa team)
  target_month   NUMERIC(18,2),           -- Chỉ tiêu tháng (tỷ đồng)
  status         team_status NOT NULL DEFAULT 'active'
);

-- §3.3 — Khách hàng tiềm năng (bảng trung tâm)
CREATE TABLE leads (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name        VARCHAR(255) NOT NULL,
  phone            VARCHAR(32) NOT NULL,  -- index tìm kiếm nhanh (không unique)
  zalo             VARCHAR(255),
  source           lead_source NOT NULL DEFAULT 'khac',
  demand           JSONB,                 -- {loai, khu_vuc, ngan_sach_min/max, muc_dich}
  status           lead_status NOT NULL DEFAULT 'moi',   -- pipeline 7 bước (§5)
  score            INT NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  assigned_to      UUID,                  -- FK → users (sale phụ trách)
  assigned_by      UUID,                  -- FK → users — THÊM MỚI: ai phân lead (team shared pool, team lead gán xuống)
  assigned_at      TIMESTAMPTZ,           -- THÊM MỚI: thời điểm phân lead
  team_id          UUID,                  -- FK → teams
  last_contact_at  TIMESTAMPTZ,
  next_follow_up_at TIMESTAMPTZ,
  note             TEXT,
  is_protected     BOOLEAN NOT NULL DEFAULT FALSE,  -- khóa bảo vệ lead (chống cướp khách)
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_leads_updated_at BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_leads_phone       ON leads (phone);
CREATE INDEX idx_leads_status      ON leads (status);
CREATE INDEX idx_leads_assigned_to ON leads (assigned_to);
CREATE INDEX idx_leads_team        ON leads (team_id);
CREATE INDEX idx_leads_next_fu     ON leads (next_follow_up_at) WHERE status NOT IN ('ky_hd','ban_giao','mat');

-- §3.4 — Lịch chăm sóc & nhắc việc
CREATE TABLE follow_ups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID NOT NULL,             -- FK → leads
  assigned_to UUID NOT NULL,             -- FK → users
  title       VARCHAR(255),              -- THÊM GĐ1: tiêu đề lịch (API contract T1 yêu cầu)
  due_at      TIMESTAMPTZ NOT NULL,      -- hạn phải liên hệ
  type        followup_type NOT NULL DEFAULT 'goi_dien',
  status      followup_status NOT NULL DEFAULT 'pending',
  note        TEXT,
  done_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_followups_due      ON follow_ups (due_at) WHERE status = 'pending';
CREATE INDEX idx_followups_assigned ON follow_ups (assigned_to, status);
CREATE INDEX idx_followups_lead     ON follow_ups (lead_id);

-- §3.5 — Nhật ký tương tác
CREATE TABLE activities (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id    UUID NOT NULL,             -- FK → leads
  user_id    UUID NOT NULL,             -- FK → users (ai thực hiện)
  type       activity_type NOT NULL,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_activities_lead ON activities (lead_id, created_at DESC);

-- §3.6 — Dự án
CREATE TABLE projects (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR(255) NOT NULL,
  investor     VARCHAR(255),
  location     VARCHAR(255),
  legal_status legal_status,
  legal_note   TEXT,                    -- THÊM MỚI: ghi chú pháp lý khi legal_status = rui_ro
  progress     TEXT,                    -- tiến độ xây dựng
  status       project_status NOT NULL DEFAULT 'dang_ban',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- §3.7 — Giỏ hàng (căn hộ/nền/nhà)
CREATE TABLE properties (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,             -- FK → projects
  code       VARCHAR(64) NOT NULL UNIQUE, -- mã căn: "S1.02-15A08"
  type       property_type NOT NULL,
  area       NUMERIC(10,2),             -- m²
  bedrooms   INT,
  direction  VARCHAR(64),              -- hướng
  floor      INT,
  price      NUMERIC(18,2) NOT NULL,   -- giá bán hiện tại
  status     property_status NOT NULL DEFAULT 'trong',
  quantity   INT NOT NULL DEFAULT 1,   -- số lượng tồn của mã căn
  images     JSONB,                    -- danh sách URL ảnh
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_properties_updated_at BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_properties_project ON properties (project_id, status);

-- §3.8 — Hồ sơ pháp lý (trình bày 3 giây)
CREATE TABLE documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type  doc_owner_type NOT NULL,  -- project / property
  owner_id    UUID NOT NULL,            -- polymorphic (không FK cứng)
  doc_type    doc_type NOT NULL,
  title       VARCHAR(255) NOT NULL,
  file_url    VARCHAR(1024) NOT NULL,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,  -- GĐ sàn kiểm duyệt
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_documents_owner ON documents (owner_type, owner_id);

-- §3.9 — Giao dịch (giữ chỗ → đặt cọc → ký HĐ + hàng đợi giữ chỗ)
CREATE TABLE deals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id          UUID NOT NULL,       -- FK → leads (khách hàng thực — bắt buộc)
  property_id      UUID,                -- FK → properties (nullable ở GĐ1 để giữ API contract T1: deal nháp có thể chưa gắn căn; siết bắt buộc ở tầng application khi vào luồng giữ chỗ — xem review note 6)
  sale_id          UUID NOT NULL,       -- FK → users
  team_id          UUID,                -- FK → teams
  agreed_price     NUMERIC(18,2),       -- giá chốt
  hold_amount      NUMERIC(18,2),       -- tiền giữ chỗ
  hold_at          TIMESTAMPTZ,
  hold_expires_at  TIMESTAMPTZ,         -- hạn chốt cọc của lượt giữ chỗ
  queue_priority   INT,                 -- thứ tự ưu tiên trong hàng đợi giữ chỗ (1,2,3...)
  deposit_amount   NUMERIC(18,2),       -- tiền cọc
  deposit_at       TIMESTAMPTZ,
  contract_at      TIMESTAMPTZ,         -- ngày ký HĐ
  handover_at      TIMESTAMPTZ,         -- ngày bàn giao
  status           deal_status NOT NULL DEFAULT 'giu_cho',
  cancel_reason    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_deals_updated_at BEFORE UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_deals_lead   ON deals (lead_id);
CREATE INDEX idx_deals_sale   ON deals (sale_id, status);
CREATE INDEX idx_deals_status ON deals (status);
-- Quy tắc chống bán trùng (quyết định 2026-10-07):
-- · Nhiều lượt GIU_CHO trên cùng 1 căn được phép (xếp hàng, không khóa căn)
-- · Chỉ 1 deal dat_coc/ky_hd/ban_giao còn hiệu lực trên mỗi căn
CREATE UNIQUE INDEX uniq_deals_active_property ON deals (property_id)
  WHERE status NOT IN ('giu_cho', 'huy');

-- §3.14 — Thông báo đẩy
CREATE TABLE notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL,             -- FK → users
  type       notification_type NOT NULL,
  title      VARCHAR(255) NOT NULL,
  body       TEXT,
  ref_type   VARCHAR(64),              -- loại đối tượng liên quan
  ref_id     UUID,                     -- ID đối tượng liên quan
  is_read    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user ON notifications (user_id, is_read, created_at DESC);

-- §3.20 — Kết quả trích xuất AI chờ xác nhận (human-in-the-loop)
CREATE TABLE ai_extractions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL,         -- FK → workspaces
  user_id        UUID NOT NULL,         -- FK → users (ai yêu cầu)
  source_type    ai_source_type NOT NULL,
  source_url     VARCHAR(1024),         -- link file gốc (ảnh/ghi âm/Excel...)
  ai_feature     ai_feature NOT NULL,
  extracted_data JSONB,                -- dữ liệu AI trích xuất (chưa lưu chính thức)
  confidence     NUMERIC(3,2) CHECK (confidence BETWEEN 0 AND 1),
  target_type    ai_target_type NOT NULL,
  target_id      UUID,                  -- ID bản ghi đã tạo (sau khi user xác nhận)
  status         extraction_status NOT NULL DEFAULT 'pending',
  reviewed_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_extractions_user ON ai_extractions (user_id, status);

-- §3.21 — Ví credit AI theo workspace (MỚI 2026-10-09, thuộc GĐ1)
CREATE TABLE ai_quotas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces (id),
  period        CHAR(7) NOT NULL,              -- kỳ quota YYYY-MM, reset đầu tháng
  credits_total INT NOT NULL DEFAULT 0,        -- = quota gói + credit mua thêm
  credits_used  INT NOT NULL DEFAULT 0,
  credits_bonus INT NOT NULL DEFAULT 0,        -- credit mua thêm trong kỳ
  status        VARCHAR(16) NOT NULL DEFAULT 'active',  -- active / exhausted
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, period)
);
CREATE TRIGGER trg_ai_quotas_updated_at BEFORE UPDATE ON ai_quotas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- §3.21 — Bảng quy đổi credit (config, sửa được theo giá provider)
CREATE TABLE ai_credit_rates (
  ai_feature ai_feature PRIMARY KEY,
  credits    INT NOT NULL,
  note       TEXT
);
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

-- §3.21 — Nhật ký trừ credit (gồm token/cost nội bộ để tính biên lợi nhuận)
CREATE TABLE ai_usage_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces (id),
  user_id      UUID REFERENCES users (id),    -- null khi system tự chạy
  ai_feature   ai_feature NOT NULL,
  credits      INT NOT NULL DEFAULT 0,         -- 0 nếu cache hit
  tokens_used  INT,                            -- tổng token provider báo về
  cost_usd     NUMERIC(10,6),                  -- chi phí thực tế theo giá provider
  initiated_by VARCHAR(16) NOT NULL DEFAULT 'user',  -- user / system
  cache_hit    BOOLEAN NOT NULL DEFAULT FALSE,
  ref_type     VARCHAR(64),
  ref_id       UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_usage_ws ON ai_usage_logs (workspace_id, created_at DESC);

-- ================= FOREIGN KEYS (thêm sau để tránh vòng tham chiếu) =================
ALTER TABLE workspaces ADD CONSTRAINT fk_ws_owner
  FOREIGN KEY (owner_id) REFERENCES users (id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE users ADD CONSTRAINT fk_users_workspace
  FOREIGN KEY (workspace_id) REFERENCES workspaces (id);
ALTER TABLE users ADD CONSTRAINT fk_users_team
  FOREIGN KEY (team_id) REFERENCES teams (id);
ALTER TABLE users ADD CONSTRAINT fk_users_manager
  FOREIGN KEY (manager_id) REFERENCES users (id);

ALTER TABLE teams ADD CONSTRAINT fk_teams_leader
  FOREIGN KEY (leader_id) REFERENCES users (id);
ALTER TABLE teams ADD CONSTRAINT fk_teams_parent
  FOREIGN KEY (parent_team_id) REFERENCES teams (id);

ALTER TABLE leads ADD CONSTRAINT fk_leads_assigned_to
  FOREIGN KEY (assigned_to) REFERENCES users (id);
ALTER TABLE leads ADD CONSTRAINT fk_leads_assigned_by
  FOREIGN KEY (assigned_by) REFERENCES users (id);
ALTER TABLE leads ADD CONSTRAINT fk_leads_team
  FOREIGN KEY (team_id) REFERENCES teams (id);

ALTER TABLE follow_ups ADD CONSTRAINT fk_fu_lead
  FOREIGN KEY (lead_id) REFERENCES leads (id) ON DELETE CASCADE;
ALTER TABLE follow_ups ADD CONSTRAINT fk_fu_assigned
  FOREIGN KEY (assigned_to) REFERENCES users (id);

ALTER TABLE activities ADD CONSTRAINT fk_act_lead
  FOREIGN KEY (lead_id) REFERENCES leads (id) ON DELETE CASCADE;
ALTER TABLE activities ADD CONSTRAINT fk_act_user
  FOREIGN KEY (user_id) REFERENCES users (id);

ALTER TABLE properties ADD CONSTRAINT fk_prop_project
  FOREIGN KEY (project_id) REFERENCES projects (id);

ALTER TABLE deals ADD CONSTRAINT fk_deals_lead
  FOREIGN KEY (lead_id) REFERENCES leads (id);
ALTER TABLE deals ADD CONSTRAINT fk_deals_property
  FOREIGN KEY (property_id) REFERENCES properties (id);
ALTER TABLE deals ADD CONSTRAINT fk_deals_sale
  FOREIGN KEY (sale_id) REFERENCES users (id);
ALTER TABLE deals ADD CONSTRAINT fk_deals_team
  FOREIGN KEY (team_id) REFERENCES teams (id);

ALTER TABLE notifications ADD CONSTRAINT fk_notif_user
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;

ALTER TABLE ai_extractions ADD CONSTRAINT fk_ai_ws
  FOREIGN KEY (workspace_id) REFERENCES workspaces (id);
ALTER TABLE ai_extractions ADD CONSTRAINT fk_ai_user
  FOREIGN KEY (user_id) REFERENCES users (id);

-- ============================================================
-- GHI CHÚ REVIEW (dev kiểm tra trước khi chạy):
-- 1. `leads.assigned_by` + `leads.assigned_at`: THÊM MỚI so với phác thảo
--    (phục vụ team shared pool: lead từ marketing về team, TP phân cho sale,
--    log vào customer 360°). Phác thảo §3.3 hiện chỉ có assigned_to.
-- 2. `projects.legal_note`: THÊM MỚI (phác thảo ghi "rui_ro + ghi chú" nhưng
--    chưa định nghĩa cột).
-- 3. documents.owner_id là polymorphic — không FK cứng; application layer
--    chịu trách nhiệm validate (project → projects, property → properties).
-- 4. Phân quyền 4 tầng + solo-bypass (§4 phác thảo) nằm ở application layer,
--    không thể hiện trong schema.
-- 5. `users.phone` unique toàn hệ thống — nếu sau này 1 SĐT dùng cho nhiều
--    workspace thì cần đổi thành unique(workspace_id, phone).
-- 6. `deals.property_id` để NULLABLE (khác phác thảo §3.9 ghi "bắt buộc") để giữ
--    API contract T1 hiện tại: deal nháp được tạo khi chưa gắn căn. Khi triển khai
--    luồng giữ chỗ → đặt cọc (GĐ3), application layer siết: giữ chỗ bắt buộc có
--    property_id + kiểm tra unique partial index uniq_deals_active_property.
-- ============================================================
