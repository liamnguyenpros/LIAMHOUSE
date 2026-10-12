#!/bin/bash
# Chạy với user pgserver. Khởi tạo + start PostgreSQL portable cho LiamHouse dev.
PGBIN=/home/hatch/workspace/pgvenv/lib/python3.12/site-packages/pgserver/pginstall
export LD_LIBRARY_PATH=$PGBIN/lib
export PATH=$PGBIN/bin:$PATH
PGDATA=/tmp/pgdata

case "$1" in
  init)
    initdb -D $PGDATA -E UTF8 --no-locale -U postgres
    ;;
  start)
    pg_ctl -D $PGDATA -l /tmp/pgdata.log -o "-p 5432" start
    ;;
  stop)
    pg_ctl -D $PGDATA stop
    ;;
  *)
    echo "usage: $0 {init|start|stop}"
    ;;
esac
