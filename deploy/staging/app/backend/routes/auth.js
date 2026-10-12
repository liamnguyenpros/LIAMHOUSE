import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { q } from '../db.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken, auth } from '../middleware/auth.js';

const router = Router();

router.post('/login', async (req, res) => {
  const { phone, password } = req.body || {};
  if (!phone || !password) {
    return res.status(400).json({ error: 'Vui lòng nhập số điện thoại và mật khẩu' });
  }
  try {
    const { rows } = await q('SELECT * FROM users WHERE phone = $1', [phone]);
    const user = rows[0];
    if (!user || user.status !== 'active') {
      return res.status(401).json({ error: 'Số điện thoại hoặc mật khẩu chưa đúng' });
    }
    const ok = bcrypt.compareSync(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Số điện thoại hoặc mật khẩu chưa đúng' });
    }
    const token = signAccessToken(user);
    const refreshToken = signRefreshToken(user);
    res.json({
      token, // access token 2h — giữ nguyên shape cũ
      refreshToken, // refresh token 30 ngày
      user: {
        id: user.id,
        full_name: user.full_name,
        phone: user.phone,
        role: user.role,
        workspace_id: user.workspace_id,
      },
    });
  } catch (err) {
    console.error('[auth/login]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// Cấp access token mới từ refresh token (không cần đăng nhập lại)
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken) return res.status(400).json({ error: 'Thiếu refreshToken' });
  try {
    const p = verifyRefreshToken(refreshToken);
    const { rows } = await q('SELECT * FROM users WHERE id = $1', [p.id]);
    const user = rows[0];
    if (!user || user.status !== 'active' || (user.token_version ?? 0) !== (p.tv ?? 0)) {
      return res.status(401).json({ error: 'invalid_token' });
    }
    res.json({ token: signAccessToken(user) });
  } catch {
    return res.status(401).json({ error: 'invalid_token' });
  }
});

// Hồ sơ của chính mình: xem + sửa (chỉ full_name, avatar_url)
router.get('/me', auth, async (req, res) => {
  try {
    const { rows } = await q(
      'SELECT id, full_name, phone, role, team_id, avatar_url, workspace_id, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[auth/me]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

router.patch('/me', auth, async (req, res) => {
  const { full_name, avatar_url } = req.body || {};
  try {
    const sets = [];
    const params = [];
    if (full_name !== undefined) {
      if (!String(full_name).trim()) return res.status(400).json({ error: 'Tên không được để trống' });
      params.push(String(full_name).trim());
      sets.push(`full_name = $${params.length}`);
    }
    if (avatar_url !== undefined) {
      params.push(avatar_url || null);
      sets.push(`avatar_url = $${params.length}`);
    }
    if (!sets.length) return res.status(400).json({ error: 'Không có gì để cập nhật' });
    params.push(req.user.id);
    const { rows } = await q(
      `UPDATE users SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length}
       RETURNING id, full_name, phone, role, team_id, avatar_url, workspace_id`,
      params
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('[auth/me-patch]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// Đăng xuất: vô hiệu hóa mọi access + refresh token đã cấp (tăng token_version)
router.post('/logout', auth, async (req, res) => {
  try {
    await q('UPDATE users SET token_version = token_version + 1, updated_at = now() WHERE id = $1', [req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[auth/logout]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// Đổi mật khẩu: đồng thời vô hiệu hóa mọi token cũ (bắt đăng nhập lại)
router.post('/change-password', auth, async (req, res) => {
  const { old_password, new_password } = req.body || {};
  if (!old_password || !new_password) {
    return res.status(400).json({ error: 'Vui lòng nhập mật khẩu cũ và mật khẩu mới' });
  }
  if (String(new_password).length < 6) {
    return res.status(400).json({ error: 'Mật khẩu mới phải từ 6 ký tự' });
  }
  try {
    const { rows } = await q('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const user = rows[0];
    if (!user || !bcrypt.compareSync(old_password, user.password_hash)) {
      return res.status(401).json({ error: 'Mật khẩu cũ chưa đúng' });
    }
    const hash = bcrypt.hashSync(new_password, 10);
    await q('UPDATE users SET password_hash = $1, token_version = token_version + 1, updated_at = now() WHERE id = $2', [hash, req.user.id]);
    res.json({ ok: true, message: 'Đổi mật khẩu thành công, vui lòng đăng nhập lại' });
  } catch (err) {
    console.error('[auth/change-password]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

export default router;
