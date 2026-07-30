'use strict';
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const config = require('./config');
const db = require('./db');

async function hashPassword(plain) {
  return bcrypt.hash(plain, config.bcryptRounds);
}
async function verifyPassword(plain, hash) {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

function initials(name) {
  const p = String(name || '').trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p[p.length - 1]?.[0] || '')).toUpperCase() || 'U';
}

// Establish the authenticated session (regenerate to prevent fixation).
function establishSession(req, user) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = user.id;
      req.session.role = user.role;
      req.session.csrf = crypto.randomBytes(24).toString('hex');
      req.session.save((e) => (e ? reject(e) : resolve()));
    });
  });
}

function destroySession(req) {
  return new Promise((resolve) => {
    if (!req.session) return resolve();
    req.session.destroy(() => resolve());
  });
}

// Loads the current user onto req.user for every request that has a session.
async function attachUser(req, _res, next) {
  try {
    if (req.session && req.session.userId) {
      const { rows } = await db.query(
        'SELECT id, role, name, email, title, spec, color, initials, active FROM users WHERE id = $1',
        [req.session.userId]
      );
      if (rows[0] && rows[0].active) req.user = rows[0];
    }
  } catch (e) {
    // fall through unauthenticated
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

// Double-submit CSRF: client echoes session.csrf via X-CSRF-Token on state-changing verbs.
function csrfProtection(req, res, next) {
  const safe = req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS';
  if (safe) return next();
  const token = req.get('X-CSRF-Token');
  if (!req.session || !req.session.csrf || token !== req.session.csrf) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }
  next();
}

module.exports = {
  hashPassword,
  verifyPassword,
  initials,
  establishSession,
  destroySession,
  attachUser,
  requireAuth,
  requireRole,
  csrfProtection,
};
