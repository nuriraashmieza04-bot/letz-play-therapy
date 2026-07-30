'use strict';
const express = require('express');
const db = require('../db');
const svc = require('../children.service');
const { generateReport } = require('../pdf');
const config = require('../config');
const activity = require('../activity');
const { requireChildAccess } = require('../permissions');

const router = express.Router({ mergeParams: true });

async function clinicInfo() {
  const { rows } = await db.query('SELECT * FROM clinic_settings WHERE id=1');
  return rows[0] || config.clinic;
}

const DOMAINS = ["Communication","Social Skills","Play Skills","Attention","Sensory Processing","Fine Motor","Gross Motor","Activities of Daily Living","Emotional Regulation","School Readiness","Goal Achievement"];

// POST generate + store a PDF report (staff or the child's parent)
router.post('/', requireChildAccess('cid'), async (req, res, next) => {
  try {
    const child = await svc.oneChildStaff(req.params.cid);
    if (!child) return res.status(404).json({ error: 'Child not found' });
    const clinic = await clinicInfo();
    let therapistName = 'Treating Therapist', therapistTitle = '';
    if (child.therapistId) {
      const t = (await db.query('SELECT name, title FROM users WHERE id=$1', [child.therapistId])).rows[0];
      if (t) { therapistName = t.name; therapistTitle = t.title || ''; }
    }
    const buf = await generateReport(child, clinic, { domains: DOMAINS, therapistName, therapistTitle });
    const filename = `report_${child.name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
    const { rows } = await db.query(
      `INSERT INTO reports (child_id, generated_by, filename, mime, bytes, pdf)
       VALUES ($1,$2,$3,'application/pdf',$4,$5) RETURNING id, filename, created_at, bytes`,
      [req.params.cid, req.user.id, filename, buf.length, buf]
    );
    await activity.record({ txt: `Report generated for ${child.name}`, ico: 'reports', color: '#6366F1', childId: req.params.cid, actorId: req.user.id });
    res.status(201).json({ id: rows[0].id, filename: rows[0].filename, bytes: rows[0].bytes, createdAt: rows[0].created_at });
  } catch (e) { next(e); }
});

// GET list stored reports for a child
router.get('/', requireChildAccess('cid'), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT id, filename, bytes, created_at FROM reports WHERE child_id=$1 ORDER BY created_at DESC', [req.params.cid]);
    res.json(rows.map((r) => ({ id: r.id, filename: r.filename, bytes: r.bytes, createdAt: r.created_at })));
  } catch (e) { next(e); }
});

// GET download a stored report
router.get('/:rid/download', requireChildAccess('cid'), async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT filename, mime, pdf FROM reports WHERE id=$1 AND child_id=$2', [req.params.rid, req.params.cid]);
    const r = rows[0];
    if (!r) return res.status(404).json({ error: 'Report not found' });
    res.setHeader('Content-Type', r.mime);
    res.setHeader('Content-Disposition', `attachment; filename="${r.filename}"`);
    res.send(r.pdf);
  } catch (e) { next(e); }
});

module.exports = router;
