'use strict';
const express = require('express');
const db = require('../db');
const { requireStaff, requireChildAccess } = require('../permissions');

const router = express.Router({ mergeParams: true });

// GET progress (parents may read their child's progress)
router.get('/', requireChildAccess('cid'), async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM progress_points WHERE child_id=$1 ORDER BY recorded_at', [req.params.cid]);
    const progress = {};
    rows.forEach((r) => { (progress[r.domain] ||= []).push({ date: r.recorded_at, value: r.value }); });
    res.json(progress);
  } catch (e) { next(e); }
});

// POST a manual progress point (staff)
router.post('/', requireStaff, requireChildAccess('cid'), async (req, res, next) => {
  try {
    const { domain, value } = req.body || {};
    if (!domain || typeof value !== 'number') return res.status(400).json({ error: 'domain and numeric value required' });
    await db.query('INSERT INTO progress_points (child_id, domain, value, recorded_at) VALUES ($1,$2,$3, now())',
      [req.params.cid, domain, Math.max(0, Math.min(100, Math.round(value)))]);
    const { rows } = await db.query('SELECT * FROM progress_points WHERE child_id=$1 ORDER BY recorded_at', [req.params.cid]);
    const progress = {};
    rows.forEach((r) => { (progress[r.domain] ||= []).push({ date: r.recorded_at, value: r.value }); });
    res.status(201).json(progress);
  } catch (e) { next(e); }
});

// DELETE latest point for a domain (staff) — simple correction tool
router.delete('/:domain', requireStaff, requireChildAccess('cid'), async (req, res, next) => {
  try {
    await db.query(
      `DELETE FROM progress_points WHERE id = (
         SELECT id FROM progress_points WHERE child_id=$1 AND domain=$2 ORDER BY recorded_at DESC LIMIT 1)`,
      [req.params.cid, req.params.domain]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
