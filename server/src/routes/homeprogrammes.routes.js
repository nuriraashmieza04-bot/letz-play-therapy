'use strict';
const express = require('express');
const db = require('../db');
const S = require('../shapes');
const activity = require('../activity');
const { requireStaff, requireChildAccess } = require('../permissions');

const router = express.Router({ mergeParams: true });

async function one(id) {
  const { rows } = await db.query('SELECT * FROM home_programmes WHERE id=$1', [id]);
  return rows[0] ? S.hpOut(rows[0]) : null;
}

// parents may read their child's programmes; writes are staff-only
router.get('/', requireChildAccess('cid'), async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM home_programmes WHERE child_id=$1 ORDER BY assigned DESC', [req.params.cid]);
    res.json(rows.map(S.hpOut));
  } catch (e) { next(e); }
});

router.post('/', requireStaff, requireChildAccess('cid'), async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.t) return res.status(400).json({ error: 'Title is required' });
    const { rows } = await db.query(
      `INSERT INTO home_programmes (child_id, title, objective, materials, instructions, frequency, outcome, completion, status, assigned_by, assigned)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',$9, now()) RETURNING id`,
      [req.params.cid, b.t, b.obj || '—', b.mat || '—', b.instr || '—', b.freq || 'As needed', b.out || '—', b.completion || 0, req.user.id]
    );
    const child = (await db.query('SELECT name FROM children WHERE id=$1', [req.params.cid])).rows[0];
    await activity.record({ txt: `Home programme assigned to ${child.name}`, ico: 'home', color: '#22C55E', childId: req.params.cid, actorId: req.user.id });
    res.status(201).json(await one(rows[0].id));
  } catch (e) { next(e); }
});

router.put('/:hid', requireStaff, requireChildAccess('cid'), async (req, res, next) => {
  try {
    const b = req.body || {};
    await db.query(
      `UPDATE home_programmes SET title=COALESCE($1,title), objective=COALESCE($2,objective),
         materials=COALESCE($3,materials), instructions=COALESCE($4,instructions),
         frequency=COALESCE($5,frequency), outcome=COALESCE($6,outcome),
         completion=COALESCE($7,completion), status=COALESCE($8,status), updated_at=now()
       WHERE id=$9 AND child_id=$10`,
      [b.t ?? null, b.obj ?? null, b.mat ?? null, b.instr ?? null, b.freq ?? null, b.out ?? null,
       b.completion ?? null, b.status ?? null, req.params.hid, req.params.cid]
    );
    res.json(await one(req.params.hid));
  } catch (e) { next(e); }
});

router.delete('/:hid', requireStaff, requireChildAccess('cid'), async (req, res, next) => {
  try {
    await db.query('DELETE FROM home_programmes WHERE id=$1 AND child_id=$2', [req.params.hid, req.params.cid]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
