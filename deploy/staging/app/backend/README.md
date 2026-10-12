# LIAMHOUSE Backend — GĐ1 (Express + PostgreSQL)

Backend T1 cho sale: 8 route groups — `auth`, `dashboard`, `leads`, `follow-ups`,
`activities`, `projects`, `deals`, `notifications`. Mọi query đã port từ
better-sqlite3 sang `pg` (async). API contract giữ nguyên để frontend React cũ chạy tiếp.

## 1. PostgreSQL local

```bash
# Cài (Ubuntu)
sudo apt-get install -y postgresql postgresql-contrib
sudo pg_ctlcluster 16 main start

# Tạo role + database dev (chạy 1 lần)
sudo -u postgres psql -c "CREATE USER liamhouse WITH PASSWORD 'liamhouse_dev_pw' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE liamhouse_dev OWNER liamhouse;"
```

## 2. Migration

Schema chuẩn GĐ1: `~/workspace/liamhouse-gd1-kickoff/schema-v1.sql`
(15 bảng: 12 bảng T1 + `ai_quotas`, `ai_credit_rates`, `ai_usage_logs`).

```bash
export PGPASSWORD='liamhouse_dev_pw'
psql -h localhost -U liamhouse -d liamhouse_dev -v ON_ERROR_STOP=1 \
  -f ~/workspace/liamhouse-gd1-kickoff/schema-v1.sql
```

## 3. Cài đặt & chạy

```bash
cd ~/workspace/liamhouse-app/backend
npm install

# Seed demo: 1 workspace, 1 sale (0901234567/demo123456), 5 leads, 2 lịch, 1 dự án
npm run seed

# Chạy dev (JWT_SECRET bắt buộc đặt ngoài local)
JWT_SECRET='chuoi-bi-mat-cua-ban' PORT=3001 node server.js
# hoặc: npm start (dùng secret dev — CHỈ local)
```

## 4. Biến môi trường

| Biến | Mặc định (dev) | Ghi chú |
|---|---|---|
| `PGHOST` / `PGPORT` | `localhost` / `5432` | |
| `PGDATABASE` / `PGUSER` / `PGPASSWORD` | `liamhouse_dev` / `liamhouse` / `liamhouse_dev_pw` | Đổi pass khi lên máy khác |
| `PGPOOL_MAX` | `10` | Số connection tối đa |
| `JWT_SECRET` | *(không có)* | **Bắt buộc khi `NODE_ENV=production`** — thiếu thì server từ chối khởi động ngay |
| `CORS_ORIGIN` | `http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173` | Danh sách origin được phép, phân tách dấu phẩy |
| `PORT` | `3001` | |
| `NODE_ENV` | `development` | `production` → cấm fallback secret dev |

### Auth (GĐ1 hardening)
- Access token: **2h** (`token` trong response login — giữ nguyên shape cũ).
- Refresh token: **30 ngày** (`refreshToken` trong response login) → `POST /api/auth/refresh` cấp access mới.
- `POST /api/auth/logout` và `POST /api/auth/change-password` tăng `users.token_version` → vô hiệu hóa mọi token cũ.
- Rate limit: `/api/auth/*` **10 req/15 phút/IP** (chống brute-force), toàn `/api` **300 req/15 phút/IP** → vượt trả `429` JSON tiếng Việt.
- Security headers qua `helmet`; CORS chỉ cho origin trong `CORS_ORIGIN`.

## 5. Mapping SQLite → PostgreSQL (giữ API contract)

| SQLite (cũ) | PostgreSQL (mới) | Xử lý ở lớp API |
|---|---|---|
| `leads.owner_id` | `leads.assigned_to` | query scope theo `assigned_to` |
| `leads.demand_json` TEXT | `leads.demand` JSONB | trả về `demand_json` dạng chuỗi JSON (frontend `JSON.parse`) |
| `follow_ups.owner_id` | `follow_ups.assigned_to` | + cột `title` (thêm mới, API yêu cầu) |
| `activities.owner_id` | `activities.user_id` | |
| `projects.developer` / `workspace_id` | `projects.investor` / — | bỏ scope workspace ở GĐ1 |
| `properties.status='dang_ban'` | `'trong'` | API map ngược `trong`→`dang_ban` |
| `documents.project_id` | `owner_id` + `owner_type='project'` | `doc_type` default `'khac'` |
| `deals.owner_id` / `value` / `status cho_duyet/da_chot` | `sale_id` / `agreed_price` / `giu_cho/ky_hd` | API map status + alias `value`, `closed_at` (=`contract_at`) |
| `deals.property_id NOT NULL` | **NULLABLE** | API cho deal nháp chưa gắn căn (siết ở application khi vào luồng giữ chỗ) |
| `notifications.is_read` 0/1 | BOOLEAN | `type` bắt buộc → map `'deal_approved'`… |
| `activity_type` | enum + `'doi_trang_thai'` | thêm cho log đổi bước pipeline |

Ngày "hôm nay" tính theo múi giờ `Asia/Ho_Chi_Minh` trong SQL.

## 6. Test nhanh

```bash
# health + login
curl http://localhost:3001/api/health
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"phone":"0901234567","password":"demo123456"}' | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).token))")

# các endpoint cần token
curl http://localhost:3001/api/leads -H "Authorization: Bearer $TOKEN"
curl http://localhost:3001/api/dashboard/summary -H "Authorization: Bearer $TOKEN"
```

## 7. Giới hạn đã biết (làm ở bước sau, KHÔNG trong GĐ1)

- Chưa có: commissions, teams (CRUD), chống bán trùng ở application, hàng đợi giữ chỗ,
  upload file thật.
- `users.phone` unique toàn hệ thống (muốn 1 SĐT nhiều workspace thì đổi sau).
- Rate limit dùng memory store (1 instance) — khi scale nhiều instance thì chuyển sang Redis store.
