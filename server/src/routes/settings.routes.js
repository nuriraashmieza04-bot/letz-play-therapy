'use strict';
const express = require('express');
const db = require('../db');
const config = require('../config');
const { requireRole } = require('../auth');

const router = express.Router();

router.get('/clinic', async (_req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM clinic_settings WHERE id=1');
    const c = rows[0] || config.clinic;
    res.json({ name: c.name, tagline: c.tagline, address: c.address, phone: c.phone, email: c.email });
  } catch (e) { next(e); }
});

router.put('/clinic', requireRole('admin'), async (req, res, next) => {
  try {
    const b = req.body || {};
    await db.query(
      `INSERT INTO clinic_settings (id, name, tagline, address, phone, email, updated_at)
       VALUES (1,$1,$2,$3,$4,$5, now())
       ON CONFLICT (id) DO UPDATE SET name=$1, tagline=$2, address=$3, phone=$4, email=$5, updated_at=now()`,
      [b.name, b.tagline, b.address, b.phone, b.email]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
