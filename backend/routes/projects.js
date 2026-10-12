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

export default router;
