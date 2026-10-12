#!/bin/bash
# remote-setup.sh — chạy TRÊN server của user (Ubuntu/Debian) để dựng GĐ1 backend production.
# Cách dùng:  sudo bash remote-setup.sh /tmp/liamhouse-gd1.tar.gz [GEMINI_API_KEY]
#   - Đối số thứ 2 (tùy chọn): key Gemini để bật AI thật. Không có key → AI chạy ở chế độ mock.
#   - Có thể chạy lại sau với key: sudo bash remote-setup.sh /tmp/liamhouse-gd1.tar.gz <key>
# Idempotent: chạy lại nhiều lần an toàn (schema/seed chỉ chạy khi DB còn trống).
set -euo pipefail

TARBALL="${1:-/tmp/liamhouse-gd1.tar.gz}"
GEMINI_KEY="${2:-}"
APP_ROOT="/opt/liamhouse"
ENV_FILE="$APP_ROOT/.env"
PGDB="liamhouse_dev"
PGUSER="liamhouse"

log() { echo "== $*"; }

[ -f "$TARBALL" ] || { echo "Không thấy tarball: $TARBALL"; exit 1; }

# ---------- 1. OS + quyền ----------
if [ "$(id -u)" -ne 0 ]; then echo "Hãy chạy với sudo."; exit 1; fi
if ! grep -qiE 'ubuntu|debian' /etc/os-release; then
  echo "Script này hỗ trợ Ubuntu/Debian. OS hiện tại không hỗ trợ tự động."
  exit 1
fi

# ---------- 2. Node.js 24 + PostgreSQL ----------
log "Cài Node.js 24 + PostgreSQL (nếu chưa có)..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl openssl ca-certificates gnupg >/dev/null
if ! command -v node >/dev/null || ! node -v | grep -q 'v24'; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
if ! command -v psql >/dev/null; then
  apt-get install -y -qq postgresql postgresql-contrib >/dev/null
fi
log "node $(node -v) | psql $(psql --version | awk '{print $3}')"
systemctl enable --now postgresql >/dev/null 2>&1 || service postgresql start

# ---------- 3. Role + database ----------
log "Tạo role/db PostgreSQL (idempotent)..."
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$PGUSER'" | grep -q 1; then
  PGPW="$(openssl rand -hex 24)"
  sudo -u postgres psql -q -c "CREATE USER $PGUSER WITH PASSWORD '$PGPW' CREATEDB;"
  echo "$PGPW" > /root/.liamhouse_pg_pw
  chmod 600 /root/.liamhouse_pg_pw
  log "Đã tạo role $PGUSER (pass lưu tại /root/.liamhouse_pg_pw)"
else
  PGPW="$(cat /root/.liamhouse_pg_pw 2>/dev/null || echo '')"
fi
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$PGDB'" | grep -q 1; then
  sudo -u postgres psql -q -c "CREATE DATABASE $PGDB OWNER $PGUSER;"
  sudo -u postgres psql -q -d "$PGDB" -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
  log "Đã tạo database $PGDB"
fi

SYSUSER="liamhouse"
if ! id "$SYSUSER" >/dev/null 2>&1; then
  useradd -r -m -s /bin/bash "$SYSUSER"
  log "Đã tạo system user $SYSUSER"
fi

# ---------- 4. Giải nén app ----------
log "Giải nén app vào $APP_ROOT..."
if [ -d "$APP_ROOT/app" ]; then
  mv "$APP_ROOT/app" "$APP_ROOT/app.bak.$(date +%Y%m%d%H%M%S)" || true
fi
mkdir -p "$APP_ROOT"
tar -xzf "$TARBALL" -C "$APP_ROOT"
chown -R "$SYSUSER":"$SYSUSER" "$APP_ROOT"

log "npm install backend..."
cd "$APP_ROOT/app/backend"
sudo -u "$SYSUSER" npm ci --omit=dev --no-audit --no-fund 2>&1 | tail -1

# ---------- 5. .env production ----------
if [ ! -f "$ENV_FILE" ]; then
  log "Tạo $ENV_FILE (JWT_SECRET ngẫu nhiên)..."
  cat > "$ENV_FILE" <<EOF
NODE_ENV=production
PORT=3001
PGHOST=localhost
PGPORT=5432
PGDATABASE=$PGDB
PGUSER=$PGUSER
PGPASSWORD=$PGPW
JWT_SECRET=$(openssl rand -hex 48)
CORS_ORIGIN=http://localhost:3001
EOF
  chmod 600 "$ENV_FILE"
else
  log ".env đã có — giữ nguyên (không ghi đè secret cũ)."
fi
# Key Gemini (tùy chọn): ghi/chép đè vào .env để AI chạy thật thay vì mock.
# Chạy lại script với key bất cứ lúc nào đều an toàn (idempotent, không mất dữ liệu).
if [ -n "$GEMINI_KEY" ]; then
  log "Ghi GEMINI_API_KEY vào .env..."
  if grep -q '^GEMINI_API_KEY=' "$ENV_FILE"; then
    tmp_env="$(mktemp)"
    while IFS= read -r line || [ -n "$line" ]; do
      case "$line" in
        GEMINI_API_KEY=*) printf 'GEMINI_API_KEY=%s\n' "$GEMINI_KEY" >> "$tmp_env" ;;
        *) printf '%s\n' "$line" >> "$tmp_env" ;;
      esac
    done < "$ENV_FILE"
    cat "$tmp_env" > "$ENV_FILE"; rm -f "$tmp_env"
  else
    printf 'GEMINI_API_KEY=%s\n' "$GEMINI_KEY" >> "$ENV_FILE"
  fi
  chmod 600 "$ENV_FILE"
else
  log "Chưa có GEMINI_API_KEY → AI chạy ở chế độ mock (chạy lại script với key để bật AI thật)."
fi
set -a; . "$ENV_FILE"; set +a

# ---------- 6. Schema + migration (chỉ khi DB trống) ----------
export PGPASSWORD="$PGPW"
HAS_USERS="$(psql -h localhost -U "$PGUSER" -d "$PGDB" -tAc "SELECT to_regclass('public.users') IS NOT NULL")"
if [ "$HAS_USERS" != "t" ]; then
  log "DB trống → chạy schema-v1.sql..."
  psql -h localhost -U "$PGUSER" -d "$PGDB" -v ON_ERROR_STOP=1 -q -f "$APP_ROOT/db/schema-v1.sql"
else
  log "DB đã có bảng users → bỏ qua schema (giữ dữ liệu cũ)."
fi
log "Chạy migration 001 (idempotent)..."
psql -h localhost -U "$PGUSER" -d "$PGDB" -v ON_ERROR_STOP=1 -q -f "$APP_ROOT/db/001-token-version.sql"
if [ -f "$APP_ROOT/db/002-t1-full-features.sql" ]; then
  log "Chạy migration 002 (idempotent)..."
  psql -h localhost -U "$PGUSER" -d "$PGDB" -v ON_ERROR_STOP=1 -q -f "$APP_ROOT/db/002-t1-full-features.sql"
else
  log "Không có file 002 trong gói → bỏ qua."
fi
if [ -f "$APP_ROOT/db/003-matching-payments.sql" ]; then
  log "Chạy migration 003 (idempotent)..."
  psql -h localhost -U "$PGUSER" -d "$PGDB" -v ON_ERROR_STOP=1 -q -f "$APP_ROOT/db/003-matching-payments.sql"
else
  log "Không có file 003 trong gói → bỏ qua."
fi
if [ -f "$APP_ROOT/db/004-ai-gateway.sql" ]; then
  log "Chạy migration 004 (AI Gateway, idempotent)..."
  psql -h localhost -U "$PGUSER" -d "$PGDB" -v ON_ERROR_STOP=1 -q -f "$APP_ROOT/db/004-ai-gateway.sql"
else
  log "Không có file 004 trong gói → bỏ qua."
fi
if [ -f "$APP_ROOT/db/005-commissions.sql" ]; then
  log "Chạy migration 005 (Commissions, idempotent)..."
  psql -h localhost -U "$PGUSER" -d "$PGDB" -v ON_ERROR_STOP=1 -q -f "$APP_ROOT/db/005-commissions.sql"
else
  log "Không có file 005 trong gói → bỏ qua."
fi
if [ -f "$APP_ROOT/db/006-hold-queue.sql" ]; then
  log "Chạy migration 006 (Hold Queue, idempotent)..."
  psql -h localhost -U "$PGUSER" -d "$PGDB" -v ON_ERROR_STOP=1 -q -f "$APP_ROOT/db/006-hold-queue.sql"
else
  log "Không có file 006 trong gói → bỏ qua."
fi

# ---------- 7. Seed demo (chỉ khi chưa có user nào) ----------
USER_COUNT="$(psql -h localhost -U "$PGUSER" -d "$PGDB" -tAc 'SELECT COUNT(*) FROM users')"
if [ "$USER_COUNT" -eq 0 ]; then
  log "Chưa có user → seed demo (0901234567/demo123456)..."
  sudo -u "$SYSUSER" env $(grep -v '^#' "$ENV_FILE" | xargs) node seed.js 2>&1 | tail -2 || \
    env $(grep -v '^#' "$ENV_FILE" | xargs) node seed.js 2>&1 | tail -2
else
  log "Đã có $USER_COUNT user → bỏ qua seed (giữ dữ liệu cũ)."
fi

# ---------- 8. systemd service ----------
log "Cài systemd service liamhouse..."
cat > /etc/systemd/system/liamhouse.service <<EOF
[Unit]
Description=LIAMHOUSE GĐ1 backend (Express + PostgreSQL)
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=$SYSUSER
WorkingDirectory=$APP_ROOT/app/backend
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now liamhouse >/dev/null
sleep 4
systemctl is-active --quiet liamhouse && log "Service liamhouse: RUNNING" || { echo "Service KHÔNG chạy:"; journalctl -u liamhouse -n 20 --no-pager; exit 1; }

# ---------- 9. Kiểm tra ----------
log "Kiểm tra /api/health..."
HEALTH="$(curl -s http://localhost:3001/api/health || echo FAIL)"
echo "  $HEALTH"
UNA="$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/api/leads)"
echo "  Gọi API không token → HTTP $UNA (mong đợi 401)"

TAIL_IP="$(tailscale ip -4 2>/dev/null | head -1 || echo '')"
echo
echo "==================== XONG ===================="
echo "Mở trên điện thoại (cùng mạng Tailscale):  http://${TAIL_IP:-<tailscale-ip-cua-server>}:3001"
echo "Tài khoản demo: 0901234567 / demo123456"
echo "Log:  journalctl -u liamhouse -f"
echo "=============================================="
