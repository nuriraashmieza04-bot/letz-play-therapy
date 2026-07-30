'use strict';
const db = require('./db');

const isStaff = (u) => u && (u.role === 'admin' || u.role === 'therapist');
const isAdmin = (u) => u && u.role === 'admin';
const isParent = (u) => u && u.role === 'parent';

// Can the given user access this child record at all?
async function canAccessChild(user, childId) {
  if (!user) return false;
  const { rows } = await db.query('SELECT id, parent_email FROM children WHERE id = $1', [childId]);
  const child = rows[0];
  if (!child) return false;
  if (isStaff(user)) return true;
  if (isParent(user)) {
    return String(child.parent_email || '').toLowerCase() === String(user.email || '').toLowerCase();
  }
  return false;
}

// Middleware factory: ensure the :id / :cid param child is accessible.
function requireChildAccess(param = 'id') {
  return async (req, res, next) => {
    try {
      const childId = req.params[param];
      const ok = await canAccessChild(req.user, childId);
      if (!ok) return res.status(403).json({ error: 'Forbidden' });
      req.childId = childId;
      next();
    } catch (e) {
      next(e);
    }
  };
}

// Staff-only guard (admin or therapist) — used for clinical writes & SOAP reads.
function requireStaff(req, res, next) {
  if (!isStaff(req.user)) return res.status(403).json({ error: 'Staff access required' });
  next();
}

module.exports = { isStaff, isAdmin, isParent, canAccessChild, requireChildAccess, requireStaff };
