-- 001-token-version.sql — GĐ1 auth hardening
-- Thêm token_version cho users để vô hiệu hóa token khi logout / đổi mật khẩu.
-- Mỗi lần logout hoặc đổi mật khẩu: token_version += 1 -> mọi access/refresh token cũ (mang tv cũ) bị từ chối.
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version int NOT NULL DEFAULT 0;
