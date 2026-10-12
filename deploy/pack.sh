#!/bin/bash
# pack.sh — đóng gói GĐ1 backend + frontend production thành 1 tarball để scp lên server.
# Chạy trên máy dev:  bash ~/workspace/liamhouse-app/deploy/pack.sh
set -euo pipefail

APP_DIR="$HOME/workspace/liamhouse-app"
DEPLOY_DIR="$APP_DIR/deploy"
STAGE="$DEPLOY_DIR/staging"
TARBALL="$DEPLOY_DIR/liamhouse-gd1.tar.gz"

echo "[1/4] Build frontend production (same-origin /api)..."
cd "$APP_DIR/frontend"
npm run build >/dev/null 2>&1
echo "      dist OK: $(du -sh dist | cut -f1)"

echo "[2/4] Chuẩn bị staging..."
rm -rf "$STAGE"
mkdir -p "$STAGE/app" "$STAGE/db"
# backend: bỏ node_modules, data dev, file tạm
rsync -a --delete \
  --exclude 'node_modules' --exclude 'data/' --exclude '.git' \
  "$APP_DIR/backend/" "$STAGE/app/backend/"
mkdir -p "$STAGE/app/frontend"
cp -r "$APP_DIR/frontend/dist" "$STAGE/app/frontend/dist"
cp "$HOME/workspace/liamhouse-gd1-kickoff/schema-v1.sql" "$STAGE/db/schema-v1.sql"
cp "$APP_DIR/backend/migrations/001-token-version.sql" "$STAGE/db/001-token-version.sql"
cp "$APP_DIR/backend/migrations/002-t1-full-features.sql" "$STAGE/db/002-t1-full-features.sql"
cp "$APP_DIR/backend/migrations/003-matching-payments.sql" "$STAGE/db/003-matching-payments.sql"
cp "$APP_DIR/backend/migrations/004-ai-gateway.sql" "$STAGE/db/004-ai-gateway.sql"
cp "$APP_DIR/backend/migrations/005-commissions.sql" "$STAGE/db/005-commissions.sql"
cp "$APP_DIR/backend/migrations/006-hold-queue.sql" "$STAGE/db/006-hold-queue.sql"
cp "$APP_DIR/backend/migrations/007-pricing-commission-rules.sql" "$STAGE/db/007-pricing-commission-rules.sql"
cp "$APP_DIR/backend/migrations/008-kpi-system.sql" "$STAGE/db/008-kpi-system.sql"
cp "$APP_DIR/backend/migrations/009-call-campaigns.sql" "$STAGE/db/009-call-campaigns.sql"
cp "$APP_DIR/backend/migrations/010-public-api.sql" "$STAGE/db/010-public-api.sql"
echo "      backend: $(du -sh "$STAGE/app/backend" | cut -f1) (chưa có node_modules)"

echo "[3/4] Nén tarball..."
cd "$STAGE"
tar -czf "$TARBALL" app db
echo "      $TARBALL ($(du -h "$TARBALL" | cut -f1))"

echo "[4/4] Kiểm tra nội dung tarball:"
tar -tzf "$TARBALL" | head -12
echo "..."
echo "XONG. Mang file sau lên server + chạy remote-setup.sh:"
echo "  $TARBALL"
