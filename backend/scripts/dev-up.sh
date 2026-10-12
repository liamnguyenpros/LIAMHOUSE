#!/bin/bash
# dev-up.sh — Khôi phục toàn bộ môi trường dev LiamHouse GĐ1 sau khi VM bị thay.
# Chạy 1 lệnh: bash ~/workspace/liamhouse-app/backend/scripts/dev-up.sh
# Làm gì: PostgreSQL portable (pgserver) -> tạo role/db -> migration -> seed -> start backend :3001
set -e
WS=/home/hatch/workspace
BE=$WS/liamhouse-app/backend
VENV=$WS/pgvenv
PGSITE=$VENV/lib/python3.12/site-packages
PGBIN=$PGSITE/pgserver/pginstall/bin
export PATH=$PGBIN:$PATH

echo "== 1. venv + pgserver =="
[ -x $VENV/bin/python ] || python3 -m venv $VENV
$VENV/bin/pip install -q pgserver 2>&1 | tail -1
chmod -R o+rX $PGSITE/pgserver.libs $PGSITE/pgserver/pginstall 2>/dev/null || true

echo "== 2. PostgreSQL (user pgserver, data /tmp/pgdata) =="
id pgserver >/dev/null 2>&1 || sudo useradd -s /bin/bash pgserver
# /home/hatch mặc định drwxrws--- (other không traverse) -> user pgserver không đọc được binary trong ~/workspace.
# Chỉ mở traverse (o+x, không o+r) để pgserver tới được pgvenv; vẫn không list được nội dung /home/hatch.
chmod o+x /home/hatch 2>/dev/null || true
cat > /tmp/pg-ctl.sh <<EOF
#!/bin/bash
export LD_LIBRARY_PATH=$PGSITE/pgserver.libs
export PATH=$PGBIN:\$PATH
case "\$1" in
  init)  initdb -D /tmp/pgdata -E UTF8 --no-locale -U postgres ;;
  start) pg_ctl -D /tmp/pgdata -l /tmp/pgdata.log -o "-p 5432" start ;;
  stop)  pg_ctl -D /tmp/pgdata stop -m fast ;;
esac
EOF
chmod 755 /tmp/pg-ctl.sh
# data /tmp mất khi reboot -> init lại cho sạch
su pgserver -c "bash /tmp/pg-ctl.sh stop" >/dev/null 2>&1 || true
rm -rf /tmp/pgdata
mkdir -p /tmp/pgdata && chmod 700 /tmp/pgdata
# /tmp cho phép chown (workspace thì không)
chown pgserver:pgserver /tmp/pgdata || { echo "WARN: chown /tmp failed"; }
su pgserver -c "bash /tmp/pg-ctl.sh init" >/dev/null
su pgserver -c "bash /tmp/pg-ctl.sh start"
sleep 2

echo "== 3. role + database =="
cat > /tmp/pg-setup.sql <<'SQLEOF'
CREATE ROLE liamhouse WITH LOGIN PASSWORD 'liamhouse_dev_pw' CREATEDB;
CREATE DATABASE liamhouse_dev OWNER liamhouse;
SQLEOF
chmod 644 /tmp/pg-setup.sql
su pgserver -c "$PGBIN/psql -h localhost -U postgres -f /tmp/pg-setup.sql"

echo "== 4. migration =="
PGPASSWORD='liamhouse_dev_pw' $PGBIN/psql -h localhost -U liamhouse -d liamhouse_dev \
  -f $WS/liamhouse-gd1-kickoff/schema-v1.sql > /dev/null
# Áp dụng các migration bổ sung (idempotent qua IF NOT EXISTS)
for mig in $BE/migrations/*.sql; do
  [ -e "$mig" ] || continue
  echo "  -> $(basename $mig)"
  PGPASSWORD='liamhouse_dev_pw' $PGBIN/psql -h localhost -U liamhouse -d liamhouse_dev -f "$mig" > /dev/null
done
echo "tables: $(PGPASSWORD='liamhouse_dev_pw' $PGBIN/psql -h localhost -U liamhouse -d liamhouse_dev -tAc "select count(*) from information_schema.tables where table_schema='public'")"

echo "== 5. seed =="
cd $BE
PGUSER=liamhouse PGPASSWORD='liamhouse_dev_pw' PGHOST=localhost PGDATABASE=liamhouse_dev npm run seed 2>&1 | tail -2

echo "== 6. backend :3001 =="
pkill -f "node server.js" 2>/dev/null || true
cd $BE
PGUSER=liamhouse PGPASSWORD='liamhouse_dev_pw' PGHOST=localhost PGDATABASE=liamhouse_dev \
  nohup node server.js > /tmp/liamhouse-api.log 2>&1 &
sleep 3
curl -s --noproxy '*' -m 5 -o /dev/null -w "API status: %{http_code}\n" http://localhost:3001/api/auth/login -X POST || true
echo "XONG. Log API: /tmp/liamhouse-api.log | Log PG: /tmp/pgdata.log"
