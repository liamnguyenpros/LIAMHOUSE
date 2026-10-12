import { Router } from 'express';
import { q, mapProperty } from '../db.js';
import { auth } from '../middleware/auth.js';

const router = Router();
router.use(auth);

router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    const params = [];
    const conds = [];
    if (status) {
      params.push(status);
      conds.push(`p.status = $${params.length}`);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const { rows } = await q(
      `SELECT p.*, (SELECT COUNT(*) FROM properties WHERE project_id = p.id AND status = 'trong') AS can_con_trong
       FROM projects p ${where} ORDER BY p.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error('[projects:list]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await q('SELECT * FROM projects WHERE id = $1', [req.params.id]);
    const project = rows[0];
    if (!project) return res.status(404).json({ error: 'Không tìm thấy dự án' });
    const props = await q('SELECT * FROM properties WHERE project_id = $1 ORDER BY floor', [project.id]);
    const docs = await q(
      `SELECT * FROM documents WHERE owner_type = 'project' AND owner_id = $1`,
      [project.id]
    );
    res.json({
      ...project,
      properties: props.rows.map(mapProperty),
      documents: docs.rows,
    });
  } catch (err) {
    console.error('[projects:detail]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// Tạo dự án mới
router.post('/', async (req, res) => {
  const { name, location, developer, description, status } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Vui lòng nhập tên dự án' });
  }
  const validStatuses = ['dang_ban', 'sap_mo_ban', 'ngung_ban'];
  const st = validStatuses.includes(status) ? status : 'dang_ban';
  try {
    const { rows } = await q(
      `INSERT INTO projects (name, investor, location, status)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [String(name).trim(), developer ? String(developer).trim() : null,
       location ? String(location).trim() : null, st]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[projects:create]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// Sửa thông tin dự án
router.patch('/:id', async (req, res) => {
  const { name, location, developer, description, status } = req.body || {};
  try {
    const { rows } = await q('SELECT * FROM projects WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Không tìm thấy dự án' });
    const validStatuses = ['dang_ban', 'sap_mo_ban', 'ngung_ban'];
    const st = validStatuses.includes(status) ? status : rows[0].status;
    if (name !== undefined && !String(name).trim()) {
      return res.status(400).json({ error: 'Tên dự án không được rỗng' });
    }
    const upd = await q(
      `UPDATE projects SET name = $1, investor = $2, location = $3, status = $4
       WHERE id = $5 RETURNING *`,
      [name !== undefined ? String(name).trim() : rows[0].name,
       developer !== undefined ? (developer ? String(developer).trim() : null) : rows[0].investor,
       location !== undefined ? (location ? String(location).trim() : null) : rows[0].location,
       st, req.params.id]
    );
    res.json(upd.rows[0]);
  } catch (err) {
    console.error('[projects:update]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// Xóa dự án (chỉ khi chưa có căn nào)
router.delete('/:id', async (req, res) => {
  try {
    const cnt = await q('SELECT COUNT(*)::int AS c FROM properties WHERE project_id = $1', [req.params.id]);
    if (cnt.rows[0].c > 0) {
      return res.status(409).json({ error: 'Không thể xóa: dự án đã có sản phẩm trong giỏ hàng' });
    }
    const del = await q('DELETE FROM projects WHERE id = $1 RETURNING id', [req.params.id]);
    if (!del.rows[0]) return res.status(404).json({ error: 'Không tìm thấy dự án' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[projects:delete]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

export default router;
