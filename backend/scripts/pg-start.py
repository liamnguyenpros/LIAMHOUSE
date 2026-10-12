#!/usr/bin/env python3
"""Khởi động PostgreSQL portable (pgserver) cho LiamHouse dev.
Data dir: ~/workspace/pgdata (sống sót qua VM replace). Port 5432.
Chạy nền: nohup python3 scripts/pg-start.py &
"""
import sys
sys.path.insert(0, "/home/hatch/workspace/pgvenv/lib/python3.12/site-packages")
from pathlib import Path
import pgserver

PGDATA = Path("/home/hatch/workspace/pgdata")
PGDATA.parent.mkdir(parents=True, exist_ok=True)

srv = pgserver.get_server(str(PGDATA), cleanup_mode=None)
print("PG_URI:", srv.get_uri())
print("PGDATA:", PGDATA)

# Giữ tiến trình sống để giữ handle (cleanup_mode=None nên server không tắt khi handle đóng,
# nhưng giữ script chạy giúp dễ quản lý).
import time
try:
    while True:
        time.sleep(3600)
except KeyboardInterrupt:
    pass
