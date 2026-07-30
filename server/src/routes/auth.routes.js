'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const auth = require('../auth');
const activity = require('../activity');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});

const AVATAR_COLORS = ['#3B82F6', '#6366F1', '#0EA5E9', '#14B8A6', '#F59E0B', '#EC4899', '#8B5CF6', '#10B981'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const validEmail = (e) => /^\S+@\S+\.\S+$/.test(e);

function publicUser(u) {
  return { id: u.id, role: u.role, name: u.name, email: u.email, title: u.title, spec: u.spec, initials: u.initials, color: u.color };
}

// ---- LOGIN ----
router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const role = req.body.role; // optional hint
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const { rows } = await db.query('SELECT * FROM users WHERE lower(email) = $1', [email]);
    const user = rows[0];
    if (!user || !user.active) return res.status(401).json({ error: 'No account found for that email' });
    if (role && role !== user.role && !(role === 'therapist' && user.role === 'admin')) {
      // gentle role mismatch guard (admins may sign in via the therapist toggle)
      return res.status(401).json({ error: `This account is registered as a ${user.role}. Switch the role toggle.` });
    }
    const ok = await auth.verifyPassword(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Incorrect password' });

    await auth.establishSession(req, user);
    res.json({ user: publicUser(user), csrfToken: req.session.csrf });
  } catch (e) { next(e); }
});

// ---- SIGNUP (therapist or parent) ----
router.post('/signup', loginLimiter, async (req, res, next) => {
  try {
    const role = req.body.role === 'parent' ? 'parent' : 'therapist';
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const title = String(req.body.title || '').trim();

    if (!name) return res.status(400).json({ error: 'Full name is required' });
    if (!validEmail(email)) return res.status(400).json({ error: 'A valid email is required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const exists = await db.query('SELECT id FROM users WHERE lower(email) = $1', [email]);
    if (exists.rows[0]) return res.status(409).json({ error: 'An account with that email already exists — sign in instead' });

    const specMap = {
      'Occupational Therapist': 'Occupational Therapy',
      'Speech & Language Therapist': 'Speech Therapy',
      'Physiotherapist': 'Physiotherapy',
      'Behaviour Therapist': 'Behaviour Therapy',
      'Early Intervention Specialist': 'Early Intervention',
      'Clinic Administrator': 'Administration',
    };
    const hash = await auth.hashPassword(password);
    const { rows } = await db.query(
      `INSERT INTO users (role, name, email, password_hash, title, spec, initials, color)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [role, name, email, hash, role === 'therapist' ? (title || 'Therapist') : null,
       role === 'therapist' ? (specMap[title] || title || '') : null, auth.initials(name), pick(AVATAR_COLORS)]
    );
    const user = rows[0];
    await auth.establishSession(req, user);
    await activity.record({ txt: `${name} joined as a ${role}`, ico: 'user', actorId: user.id });
    res.status(201).json({ user: publicUser(user), csrfToken: req.session.csrf });
  } catch (e) { next(e); }
});

// ---- LOGOUT ----
router.post('/logout', async (req, res) => {
  await auth.destroySession(req);
  res.clearCookie('lpt.sid');
  res.json({ ok: true });
});

// ---- WHOAMI ----
router.get('/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ user: publicUser(req.user), csrfToken: req.session.csrf });
});

module.exports = router;
