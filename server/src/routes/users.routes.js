'use strict';
const express = require('express');
const db = require('../db');
const auth = require('../auth');
const { requireRole } = require('../auth');

const router = express.Router();
router.use(requireRole('admin')); // entire router is admin-only

const validEmail = (e) => /^\S+@\S+\.\S+$/.test(e);
const AVATAR_COLORS = ['#3B82F6', '#6366F1', '#0EA5E9', '#14B8A6', '#F59E0B', '#EC4899', '#8B5CF6', '#10B981'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function out(u) {
  return { id: u.id, role: u.role, name: u.name, email: u.email, title: u.title, spec: u.spec, active: u.active, createdAt: u.created_at };
}

router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM users ORDER BY role, created_at');
    res.json(rows.map(out));
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const b = req.body || {};
    const role = ['admin', 'therapist', 'parent'].includes(b.role) ? b.role : 'therapist';
    const name = String(b.name || '').trim();
    const email = String(b.email || '').trim().toLowerCase();
    const password = String(b.password || '');
    if (!name) return res.status(400).json({ error: 'Name is required' });
    if (!validEmail(email)) return res.status(400).json({ error: 'Valid email required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const exists = await db.query('SELECT id FROM users WHERE lower(email)=$1', [email]);
    if (exists.rows[0]) return res.status(409).json({ error: 'Email already in use' });
    const hash = await auth.hashPassword(password);
    const { rows } = await db.query(
      `INSERT INTO users (role, name, email, password_hash, title, spec, initials, color)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [role, name, email, hash, b.title || (role === 'therapist' ? 'Therapist' : null), b.spec || null, auth.initials(name), pick(AVATAR_COLORS)]
    );
    res.status(201).json(out(rows[0]));
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const b = req.body || {};
    await db.query(
      `UPDATE users SET name=COALESCE($1,name), title=COALESCE($2,title), spec=COALESCE($3,spec),
         role=COALESCE($4,role), active=COALESCE($5,active), updated_at=now() WHERE id=$6`,
      [b.name ?? null, b.title ?? null, b.spec ?? null, b.role ?? null, b.active ?? null, req.params.id]
    );
    const { rows } = await db.query('SELECT * FROM users WHERE id=$1', [req.params.id]);
    res.json(rows[0] ? out(rows[0]) : null);
  } catch (e) { next(e); }
});

router.post('/:id/reset-password', async (req, res, next) => {
  try {
    const password = String((req.body || {}).password || '');
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const hash = await auth.hashPassword(password);
    await db.query('UPDATE users SET password_hash=$1, updated_at=now() WHERE id=$2', [hash, req.params.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) return res.status(400).json({ error: 'You cannot deactivate your own account' });
    await db.query('UPDATE users SET active=FALSE, updated_at=now() WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
