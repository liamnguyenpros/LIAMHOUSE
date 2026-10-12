#!/usr/bin/env bash
# restore-dev.sh — Khôi phục môi trường dev LiamHouse GĐ1 (backend PostgreSQL) sau khi VM bị thay mới.
#
# Một lệnh duy nhất:
#   ./restore-dev.sh
#
# Làm gì:
#   1. Kiểm tra node + binary PostgreSQL (KHÔNG tự cài package hệ thống — bước cài vẫn cần bạn duyệt).
#   2. Khởi tạo cluster PostgreSQL trong thư mục home (~/.pgdata ở dưới backend/.pgdata)
#      → dữ liệu nằm trong home nên sống sót qua các lần VM bị thay; chỉ cần cài lại binary.
#   3. Tạo role + database liamhouse_dev (mật khẩu đọc từ backend/db.js nên luôn khớp server).
#   4. Chạy migration schema-v1.sql (bỏ qua nếu bảng đã có).
#   5. npm install nếu thiếu, rồi npm run seed (mặc định có seed demo; dùng --no-seed để bỏ).
#   6. Khởi động server nền + kiểm tra /api/health.
#
# Tùy chọn:  PGPORT=5433 ./restore-dev.sh --no-seed
set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "$0")" && pwd)"
PGDATA="${PGDATA_DIR:-$BACKEND_DIR/.pgdata}"
PGPORT="${PGPORT:-5432}"
PGDB="${PGDATABASE:-liamhouse_dev}"
PGUSER_APP="${PGUSER:-liamhouse}"
SCHEMA="$HOME/workspace/liamhouse-gd1-kickoff/schema-v1.sql"
SEED=1
for arg in "$@"; do
  case "$arg" in
    --no-seed) SEED=0 ;;
    *) echo "[lỗi] tham số không rõ: $arg (hỗ trợ: --no-seed)"; exit 1 ;;
  esac
done

fail() { echo "[LỖI] $*" >&2; exit 1; }
info() { echo "[✓] $*"; }

# ── 0. Điều kiện tiên quyết ──────────────────────────────────────────────
command -v node >/dev/null 2>&1 || fail "Thiếu node. Cài Node 24 trước rồi chạy lại."
[ -f "$SCHEMA" ] || fail "Không thấy migration: $SCHEMA"
if ! command -v initdb >/dev/null 2>&1; then
  echo ""
  echo "PostgreSQL chưa có trên máy (VM vừa bị thay mới)."
  echo "Cần cài 1 lần — duyệt trong chat rồi chạy:"
  echo "  sudo apt-get update && sudo apt-get install -y postgresql"
  echo ""
  echo "Xong cài đặt, chạy lại:  ./restore-dev.sh"
  exit 1
fi

# ── 1. Khởi tạo / khởi động cluster ───────────────────────────────────────
if [ ! -f "$PGDATA/PG_VERSION" ]; then
  info "Khởi tạo cluster mới tại $PGDATA ..."
  initdb -E UTF8 -D "$PGDATA" -U postgres --auth=trust >/dev/null
  info "Cluster đã tạo (auth=trust, chỉ dùng cho dev local trên máy này)."
else
  info "Cluster đã có sẵn — dùng lại dữ liệu cũ (không initdb lại)."
fi

if pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then
  info "PostgreSQL đang chạy."
else
  info "Khởi động PostgreSQL (port $PGPORT) ..."
  pg_ctl -D "$PGDATA" -l "$BACKEND_DIR/.pgdata.log" -o "-p $PGPORT -k /tmp" -w start >/dev/null
fi

PSQL="psql -h /tmp -p $PGPORT -U postgres -v ON_ERROR_STOP=1"

# ── 2. Role + database ───────────────────────────────────────────────────
if ! $PSQL -tAc "SELECT 1 FROM pg_roles WHERE rolname='$PGUSER_APP'" | grep -q 1; then
  info "Tạo role $PGUSER_APP (mật khẩu lấy từ db.js, khớp cấu hình server) ..."
  APP_PASS="$(node -e "import('$BACKEND_DIR/db.js').then(m => console.log(m.pool.options.password))" 2>/dev/null)"
  [ -n "$APP_PASS" ] || fail "Không đọc được mật khẩu từ backend/db.js"
  ESCAPED_PASS="${APP_PASS//\'/\'\'}"
  $PSQL -c "CREATE ROLE \"$PGUSER_APP\" LOGIN PASSWORD '$ESCAPED_PASS';" >/dev/null
else
  info "Role $PGUSER_APP đã tồn tại."
fi

if ! $PSQL -tAc "SELECT 1 FROM pg_database WHERE datname='$PGDB'" | grep -q 1; then
  info "Tạo database $PGDB ..."
  $PSQL -c "CREATE DATABASE \"$PGDB\" OWNER \"$PGUSER_APP\";" >/dev/null
else
  info "Database $PGDB đã tồn tại."
fi

# ── 3. Migration ─────────────────────────────────────────────────────────
TABLES=$($PSQL -d "$PGDB" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';")
if [ "${TABLES:-0}" -eq 0 ]; then
  info "Chạy migration schema-v1.sql ..."
  $PSQL -d "$PGDB" -f "$SCHEMA" >/dev/null
  info "Migration xong."
else
  info "Database đã có $TABLES bảng — bỏ qua migration (dùng --no-seed nếu chỉ muốn khởi động lại)."
fi

# ── 4. Dependencies + seed ───────────────────────────────────────────────
if [ ! -d "$BACKEND_DIR/node_modules" ]; then
  info "Cài dependencies (npm install, lần đầu hơi lâu) ..."
  (cd "$BACKEND_DIR" && npm install --no-audit --no-fund >/dev/null 2>&1)
fi

if [ "$SEED" -eq 1 ]; then
  info "Seed dữ liệu demo (xóa sạch bảng nghiệp vụ rồi seed lại) ..."
  (cd "$BACKEND_DIR" && npm run seed >/dev/null 2>&1)
  info "Seed xong. Tài khoản demo: 0901234567 / demo123456"
else
  info "Bỏ qua seed theo --no-seed."
fi

# ── 5. Khởi động server + kiểm tra ────────────────────────────────────────
if curl -s -o /dev/null -m 2 "http://localhost:3001/api/health"; then
  info "Server đã chạy sẵn trên port 3001."
else
  info "Khởi động server nền (log: $BACKEND_DIR/server.log) ..."
  (cd "$BACKEND_DIR" && nohup node server.js > server.log 2>&1 &)
fi

for i in $(seq 1 15); do
  if curl -s -m 2 "http://localhost:3001/api/health" | grep -q '"ok":true'; then
    info "Backend sống lại: http://localhost:3001 (db=postgres)"
    echo ""
    echo "Xong. Lần sau VM bị thay: 1) duyệt cài postgresql, 2) chạy lại ./restore-dev.sh"
    exit 0
  fi
  sleep 1
done
fail "Server không phản hồi /api/health — xem log: $BACKEND_DIR/server.log"
