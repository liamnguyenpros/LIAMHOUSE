# DEPLOY-PLAN — Đưa GĐ1 backend lên server của user qua Tailscale + SSH

Tình huống: user đã cài Tailscale trên server của họ. Assistant đã gửi họ 3 bước:
1. Thêm public key vào `~/.ssh/authorized_keys` trên server (key: `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIM5mtC6DyVwTIKZ+/nghT2PgBf0AIhsSKljDPqU0JYCU liamhouse-deploy-key`)
2. Tạo Tailscale auth key one-off tại login.tailscale.com
3. Gửi qua chat: auth key + địa chỉ Tailscale server (100.x.y.z hoặc tên máy) + SSH username

Đồ nghề đã chuẩn bị sẵn trong `~/workspace/liamhouse-app/deploy/`:
- `liamhouse-gd1.tar.gz` — backend + frontend production build + schema/migration (đóng gói bằng `pack.sh`)
- `remote-setup.sh` — chạy trên server: cài Node 24 + PostgreSQL, tạo role/db, giải nén, npm ci, chạy schema (chỉ khi DB trống) + migration 001 (idempotent) + seed demo (chỉ khi chưa có user), tạo `.env` production với JWT_SECRET ngẫu nhiên, cài systemd service `liamhouse`, tự kiểm tra health.

## Quy trình cho main agent (khi user gửi đủ 3 thông tin)

```bash
# 0. Join tailnet (máy này đã cài tailscale nhưng chưa connected)
sudo tailscale up --authkey=<AUTH_KEY_USER_GUI>     # key one-off, dùng 1 lần

# 1. Test SSH (user có thể cần khởi động lại sshd sau khi thêm key)
ssh -i ~/.ssh/liamhouse_deploy -o StrictHostKeyChecking=accept-new <USER>@<TAILSCALE_IP_OR_NAME> 'echo OK'

# 2. Đẩy đồ nghề lên server
scp -i ~/.ssh/liamhouse_deploy ~/workspace/liamhouse-app/deploy/liamhouse-gd1.tar.gz ~/workspace/liamhouse-app/deploy/remote-setup.sh <USER>@<TAILSCALE_IP_OR_NAME>:/tmp/

# 3. Chạy setup (Ubuntu/Debian)
ssh -i ~/.ssh/liamhouse_deploy <USER>@<TAILSCALE_IP_OR_NAME> 'sudo bash /tmp/remote-setup.sh /tmp/liamhouse-gd1.tar.gz'
```

## Checklist xác minh (remote)
- `curl http://localhost:3001/api/health` → `{"ok":true,...,"db":"postgres"}`
- `curl http://localhost:3001/api/leads` (không token) → **401**
- Login: `curl -X POST http://localhost:3001/api/auth/login -H 'Content-Type: application/json' -d '{"phone":"0901234567","password":"demo123456"}'` → có `token` + `refreshToken`
- Mở `http://<tailscale-ip-server>:3001` trên trình duyệt → thấy màn hình đăng nhập PWA (frontend production, gọi /api cùng origin)

## Fallback
- Server không phải Ubuntu/Debian: remote-setup.sh từ chối → làm tay theo `backend/README.md` (apt-get → dnf/yum tương đương).
- apt proxy/auth fail (đã từng xảy ra trên VM này): cài tay `nodejs` + `postgresql` theo cách server cho phép, rồi chạy các bước 3–9 của remote-setup.sh thủ công.
- User chưa gửi đủ thông tin: ĐỪNG deploy — chờ. Không nudge quá 1 lần/ngày.
- Sau khi user join key one-off: nhắc họ revoke key tại login.tailscale.com (key tự vô hiệu sau khi dùng, nhưng revoke cho chắc).

## An toàn
- Private key `~/.ssh/liamhouse_deploy` KHÔNG gửi cho ai, không paste vào chat.
- remote-setup.sh idempotent: chạy lại không mất dữ liệu (schema/seed có guard).
- Backup tự động: `/opt/liamhouse/app` cũ → `app.bak.<timestamp>` trước khi giải nén bản mới.
