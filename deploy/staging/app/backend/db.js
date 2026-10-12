import pg from 'pg';

const { Pool } = pg;

/**
 * Kết nối PostgreSQL qua biến môi trường:
 *   PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD
 * Mặc định local dev: liamhouse/liamhouse_dev trên localhost:5432.
 */
export const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || 'liamhouse_dev',
  user: process.env.PGUSER || 'liamhouse',
  password: process.env.PGPASSWORD || 'liamhouse_dev_pw',
  max: Number(process.env.PGPOOL_MAX || 10),
});

pool.on('error', (err) => {
  console.error('[db] pool error:', err.message);
});

/** Wrapper query thuận tiện: const { rows } = await q('SELECT ...', [p1]) */
export async function q(text, params = []) {
  return pool.query(text, params);
}

/** Chạy nhiều câu lệnh trong 1 transaction. */
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Ngày "hôm nay" theo giờ Việt Nam — dùng cho so sánh date trong dashboard/lịch. */
export const VN_TODAY = `(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`;
/** Tháng hiện tại YYYY-MM theo giờ Việt Nam. */
export const VN_MONTH = `to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM')`;

// ---------- Mapping trạng thái DB <-> API contract (giữ frontend cũ chạy) ----------

/** deals.status: DB (enum deal_status) -> API (frontend mong đợi cho_duyet/da_chot) */
export const DEAL_STATUS_TO_API = {
  giu_cho: 'cho_duyet',
  dat_coc: 'dat_coc',
  ky_hd: 'da_chot',
  ban_giao: 'ban_giao',
  huy: 'huy',
};

/** properties.status: DB (enum property_status) -> API (frontend mong đợi dang_ban) */
export const PROP_STATUS_TO_API = {
  trong: 'dang_ban',
  giu_cho: 'giu_cho',
  da_coc: 'da_coc',
  da_ban: 'da_ban',
};

/** Chuẩn hóa 1 dòng leads: frontend đọc lead.demand_json dạng chuỗi JSON. */
export function mapLead(row) {
  if (!row) return row;
  const demand = row.demand === null || row.demand === undefined
    ? null
    : typeof row.demand === 'string' ? row.demand : JSON.stringify(row.demand);
  return { ...row, demand_json: demand };
}

/** Chuẩn hóa 1 dòng deals cho API: status + value/closed_at (alias frontend dùng). */
export function mapDeal(row) {
  if (!row) return row;
  return {
    ...row,
    status: DEAL_STATUS_TO_API[row.status] || row.status,
    value: row.agreed_price !== undefined ? Number(row.agreed_price) : row.value,
    closed_at: row.contract_at !== undefined ? row.contract_at : row.closed_at,
  };
}

/** Chuẩn hóa 1 dòng properties cho API. */
export function mapProperty(row) {
  if (!row) return row;
  return { ...row, status: PROP_STATUS_TO_API[row.status] || row.status };
}

export default pool;
