import jwt from 'jsonwebtoken';
import { q } from '../db.js';

function getSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[auth] JWT_SECRET bắt buộc khi NODE_ENV=production');
  }
  console.warn('[auth] JWT_SECRET chưa đặt — dùng secret dev (chỉ dùng local, KHÔNG dùng production)');
  return 'liamhouse-dev-secret';
}

/** Fail-fast khi boot: production mà thiếu JWT_SECRET thì từ chối khởi động. */
export function requireJwtSecret() {
  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    throw new Error('[auth] JWT_SECRET bắt buộc khi NODE_ENV=production — server từ chối khởi động');
  }
}

/** Access token: 2h, mang token_version (tv) để logout/đổi mật khẩu vô hiệu hóa được. */
export function signAccessToken(user) {
  return jwt.sign(
    {
      id: user.id,
      workspace_id: user.workspace_id,
      role: user.role,
      full_name: user.full_name,
      type: 'access',
      tv: user.token_version ?? 0,
    },
    getSecret(),
    { expiresIn: '2h' }
  );
}

// Alias tương thích ngược (routes/auth.js cũ dùng signToken)
export const signToken = signAccessToken;

/** Refresh token: 30 ngày, chỉ dùng cho POST /api/auth/refresh. */
export function signRefreshToken(user) {
  return jwt.sign(
    { id: user.id, type: 'refresh', tv: user.token_version ?? 0 },
    getSecret(),
    { expiresIn: '30d' }
  );
}

export function verifyRefreshToken(token) {
  const p = jwt.verify(token, getSecret());
  if (p.type !== 'refresh') throw new Error('not_refresh_token');
  return p;
}

export async function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing_token' });
  try {
    const p = jwt.verify(token, getSecret());
    if (p.type === 'refresh') return res.status(401).json({ error: 'invalid_token' });
    // token_version đổi (logout / đổi mật khẩu) -> token cũ vô hiệu
    const { rows } = await q('SELECT token_version, status FROM users WHERE id = $1', [p.id]);
    const u = rows[0];
    if (!u || u.status !== 'active' || (u.token_version ?? 0) !== (p.tv ?? 0)) {
      return res.status(401).json({ error: 'invalid_token' });
    }
    req.user = p;
    next();
  } catch {
    return res.status(401).json({ error: 'invalid_token' });
  }
}
