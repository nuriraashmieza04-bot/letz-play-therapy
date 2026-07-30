'use strict';
const express = require('express');
const db = require('../db');
const svc = require('../children.service');
const activity = require('../activity');
const { requireStaff, requireChildAccess } = require('../permissions');

const router = express.Router();

const AVATAR_COLORS = ['#3B82F6', '#6366F1', '#0EA5E9', '#14B8A6', '#F59E0B', '#EC4899', '#8B5CF6', '#10B981'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const initials = (name) => { const p = String(name || '').trim().split(/\s+/); return ((p[0]?.[0] || '') + (p[p.length - 1]?.[0] || '')).toUpperCase(); };

// GET /api/children/:id  (full, access-checked)
router.get('/:id', requireChildAccess('id'), async (req, res, next) => {
  try {
    const child = await svc.oneChildStaff(req.params.id);
    res.json(child);
  } catch (e) { next(e); }
});

// POST /api/children  (create — staff only)
router.post('/', requireStaff, async (req, res, next) => {
  try {
    const b = req.body || {};
    const name = String(b.name || '').trim();
    if (!name) return res.status(400).json({ error: "Child's name is required" });
    const parentEmail = b.parentEmail ? String(b.parentEmail).trim().toLowerCase() : null;
    if (parentEmail && !/^\S+@\S+\.\S+$/.test(parentEmail)) return res.status(400).json({ error: 'Invalid parent email' });

    const therapistId = b.therapistId || req.user.id;
    const { rows } = await db.query(
      `INSERT INTO children (name, gender, dob, diagnosis, referral, address, therapist_id, parent_email, parent_name, color, initials, status, start_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'active', COALESCE($12, CURRENT_DATE))
       RETURNING id`,
      [name, b.gender || 'Male', b.dob || null, b.diagnosis || 'Under assessment', b.referral || null,
       b.address || '—', therapistId, parentEmail, b.parentName || null, pick(AVATAR_COLORS), initials(name), b.startDate || null]
    );
    await activity.record({ txt: `${name} enrolled`, ico: 'children', color: '#3B82F6', childId: rows[0].id, actorId: req.user.id });
    const child = await svc.oneChildStaff(rows[0].id);
    res.status(201).json(child);
  } catch (e) { next(e); }
});

// PUT /api/children/:id  (update — staff only)
router.put('/:id', requireStaff, requireChildAccess('id'), async (req, res, next) => {
  try {
    const b = req.body || {};
    const name = String(b.name || '').trim();
    if (!name) return res.status(400).json({ error: "Child's name is required" });
    const parentEmail = b.parentEmail ? String(b.parentEmail).trim().toLowerCase() : null;
    if (parentEmail && !/^\S+@\S+\.\S+$/.test(parentEmail)) return res.status(400).json({ error: 'Invalid parent email' });

    await db.query(
      `UPDATE children SET name=$1, gender=$2, dob=$3, diagnosis=$4, referral=$5,
         therapist_id=$6, parent_email=$7, parent_name=$8, initials=$9, updated_at=now()
       WHERE id=$10`,
      [name, b.gender, b.dob || null, b.diagnosis || 'Under assessment', b.referral,
       b.therapistId, parentEmail, b.parentName || null, initials(name), req.params.id]
    );
    const child = await svc.oneChildStaff(req.params.id);
    res.json(child);
  } catch (e) { next(e); }
});

// POST /api/children/:id/archive  (toggle archive — staff only)
router.post('/:id/archive', requireStaff, requireChildAccess('id'), async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT status, name FROM children WHERE id=$1', [req.params.id]);
    const cur = rows[0];
    const next = cur.status === 'archived' ? 'active' : 'archived';
    await db.query('UPDATE children SET status=$1, updated_at=now() WHERE id=$2', [next, req.params.id]);
    await activity.record({ txt: `${cur.name} ${next === 'archived' ? 'archived' : 'restored'}`, ico: 'archive', color: '#F59E0B', childId: req.params.id, actorId: req.user.id });
    const child = await svc.oneChildStaff(req.params.id);
    res.json(child);
  } catch (e) { next(e); }
});

module.exports = router;
