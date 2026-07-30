'use strict';
const express = require('express');
const db = require('../db');
const S = require('../shapes');
const svc = require('../children.service');
const { isStaff } = require('../permissions');

const router = express.Router();

// GET /api/bootstrap — everything the current user is allowed to see, in the
// exact shape the existing UI expects.
router.get('/', async (req, res, next) => {
  try {
    const user = req.user;

    // therapists / parents lists (parents only need their own identity)
    const staff = isStaff(user);

    const therapists = (await db.query(
      "SELECT * FROM users WHERE role IN ('therapist','admin') AND active = TRUE ORDER BY created_at"
    )).rows.map(S.therapistOut);

    let parents = [];
    if (staff) {
      parents = (await db.query("SELECT * FROM users WHERE role='parent' AND active = TRUE ORDER BY created_at")).rows.map(S.parentOut);
    } else {
      parents = [S.parentOut(user)];
    }

    let children = [];
    let activities = [];
    let clinic = (await db.query('SELECT * FROM clinic_settings WHERE id = 1')).rows[0] || null;

    if (staff) {
      children = await svc.assembleChildrenStaff('');
      activities = (await db.query('SELECT * FROM activities ORDER BY when_ms DESC LIMIT 30')).rows.map(S.activityOut);
    } else {
      children = await svc.assembleChildrenParent(user.email);
    }

    res.json({
      me: { id: user.id, role: user.role, name: user.name, email: user.email, title: user.title, initials: user.initials, color: user.color },
      csrfToken: req.session.csrf,
      therapists,
      parents,
      children,
      activities,
      clinic: clinic ? {
        name: clinic.name, tagline: clinic.tagline, address: clinic.address, phone: clinic.phone, email: clinic.email,
      } : null,
    });
  } catch (e) { next(e); }
});

module.exports = router;
