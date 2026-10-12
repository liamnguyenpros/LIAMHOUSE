import { Router } from 'express';
import { q } from '../db.js';
import { auth } from '../middleware/auth.js';

const router = Router();
router.use(auth);

const DOC_TYPES = ['phap_ly', 'mat_bang', 'tien_do', 'hop_dong_mau', 'khac'];

const DOC_TYPE_LABELS = {
  phap_ly: 'Pháp lý',
  mat_bang: 'Mặt bằng',
  tien_do: 'Tiến độ',
  hop_dong_mau: 'Hợp đồng mẫu',
  khac: 'Khác',
};

function mapDoc(row) {
  if (!row) return row;
  return { ...row, doc_type_label: DOC_TYPE_LABELS[row.doc_type] || row.doc_type };
}

// Danh sách hồ sơ của 1 dự án (lọc theo loại)
router.get('/projects/:id/docs', async (req, res) => {
  const { doc_type } = req.query;
  try {
    const proj = await q('SELECT id FROM projects WHERE id = $1', [req.params.id]);
    if (!proj.rows[0]) return res.status(404).json({ error: 'Không tìm thấy dự án' });
    const conds = ['project_id = $1', 'workspace_id = $2'];
    const params = [req.params.id, req.user.workspace_id];
    if (doc_type) {
      if (!DOC_TYPES.includes(doc_type)) {
        return res.status(400).json({ error: 'doc_type không hợp lệ' });
      }
      params.push(doc_type);
      conds.push(`doc_type = $${params.length}`);
    }
    const { rows } = await q(
      `SELECT * FROM project_docs WHERE ${conds.join(' AND ')} ORDER BY created_at DESC`,
      params
    );
    res.json(rows.map(mapDoc));
  } catch (err) {
    console.error('[project-docs:list]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// Thêm hồ sơ cho dự án
router.post('/projects/:id/docs', async (req, res) => {
  const { doc_type, title, description, file_url } = req.body || {};
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Vui lòng nhập tiêu đề hồ sơ' });
  }
  const dt = DOC_TYPES.includes(doc_type) ? doc_type : 'khac';
  try {
    const proj = await q('SELECT id FROM projects WHERE id = $1', [req.params.id]);
    if (!proj.rows[0]) return res.status(404).json({ error: 'Không tìm thấy dự án' });
    const { rows } = await q(
      `INSERT INTO project_docs (workspace_id, project_id, doc_type, title, description, file_url)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        req.user.workspace_id,
        req.params.id,
        dt,
        title.trim(),
        description || null,
        file_url || null,
      ]
    );
    res.status(201).json(mapDoc(rows[0]));
  } catch (err) {
    console.error('[project-docs:create]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// Xóa hồ sơ
router.delete('/project-docs/:id', async (req, res) => {
  try {
    const { rows } = await q(
      'DELETE FROM project_docs WHERE id = $1 AND workspace_id = $2 RETURNING id',
      [req.params.id, req.user.workspace_id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Không tìm thấy hồ sơ' });
    res.json({ ok: true, id: rows[0].id });
  } catch (err) {
    console.error('[project-docs:delete]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

export default router;
