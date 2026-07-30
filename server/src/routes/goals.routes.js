'use strict';
const express = require('express');
const db = require('../db');
const S = require('../shapes');
const { requireStaff, requireChildAccess } = require('../permissions');

const router = express.Router({ mergeParams: true });
router.use(requireStaff, requireChildAccess('cid'));

async function one(id) {
  const { rows } = await db.query('SELECT * FROM goals WHERE id=$1', [id]);
  return rows[0] ? S.goalOut(rows[0]) : null;
}

// create
router.post('/', async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.title) return res.status(400).json({ error: 'Goal statement is required' });
    const { rows } = await db.query(
      `INSERT INTO goals (child_id, title, domain, target, progress, status, started)
       VALUES ($1,$2,$3,$4,$5,'active', CURRENT_DATE) RETURNING id`,
      [req.params.cid, b.title, b.domain || null, b.target || 80, b.progress || 0]
    );
    res.status(201).json(await one(rows[0].id));
  } catch (e) { next(e); }
});

// update (full or partial)
router.put('/:gid', async (req, res, next) => {
  try {
    const b = req.body || {};
    await db.query(
      `UPDATE goals SET title=COALESCE($1,title), domain=COALESCE($2,domain),
         target=COALESCE($3,target), progress=COALESCE($4,progress), status=COALESCE($5,status), updated_at=now()
       WHERE id=$6 AND child_id=$7`,
      [b.title ?? null, b.domain ?? null, b.target ?? null, b.progress ?? null, b.status ?? null, req.params.gid, req.params.cid]
    );
    res.json(await one(req.params.gid));
  } catch (e) { next(e); }
});

router.delete('/:gid', async (req, res, next) => {
  try {
    await db.query('DELETE FROM goals WHERE id=$1 AND child_id=$2', [req.params.gid, req.params.cid]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
