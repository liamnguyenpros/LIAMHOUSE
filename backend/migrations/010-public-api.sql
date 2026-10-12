-- 010: Public Lead API — bảng api_keys cho webhook từ ứng dụng ngoài
CREATE TABLE IF NOT EXISTS api_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id),
  name          VARCHAR(255) NOT NULL,
  key_hash      VARCHAR(64) NOT NULL UNIQUE,  -- SHA256 của key thật
  key_prefix    VARCHAR(8) NOT NULL,          -- 8 ký tự đầu để nhận diện
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at  TIMESTAMPTZ,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_workspace ON api_keys(workspace_id);
