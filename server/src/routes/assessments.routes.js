'use strict';
const express = require('express');
const db = require('../db');
const S = require('../shapes');
const activity = require('../activity');
const { requireStaff, requireChildAccess } = require('../permissions');

// Assessments are clinical — staff only.
const router = express.Router({ mergeParams: true });
router.use(requireStaff, requireChildAccess('cid'));

function pctFromAnswers(ans) {
  if (!ans || !ans.length) return 0;
  const sum = ans.reduce((a, b) => a + (b || 0), 0);
  return Math.round((sum / (ans.length * 4)) * 100);
}

// POST developmental baseline questionnaire -> writes a progress point per domain
router.post('/', async (req, res, next) => {
  try {
    const answers = req.body.answers || {};
    const domains = Object.keys(answers);
    if (!domains.length) return res.status(400).json({ error: 'No answers provided' });

    const scores = {};
    const now = new Date();
    await db.tx(async (client) => {
      for (const d of domains) {
        const a = (answers[d] || []).map((v) => (v === null || v === undefined ? 0 : v));
        const pct = pctFromAnswers(a);
        scores[d] = pct;
        await client.query('INSERT INTO progress_points (child_id, domain, value, recorded_at) VALUES ($1,$2,$3,$4)',
          [req.params.cid, d, pct, now]);
      }
      const done = domains.every((d) => (answers[d] || []).every((v) => v !== null && v !== undefined));
      await client.query(
        'INSERT INTO assessments (child_id, therapist_id, date, answers, scores, done) VALUES ($1,$2,$3,$4,$5,$6)',
        [req.params.cid, req.user.id, now, JSON.stringify(answers), JSON.stringify(scores), done]
      );
    });

    const child = (await db.query('SELECT name FROM children WHERE id=$1', [req.params.cid])).rows[0];
    await activity.record({ txt: `Initial assessment completed for ${child.name}`, ico: 'assessment', color: '#3B82F6', childId: req.params.cid, actorId: req.user.id });

    // return refreshed progress + assessment
    const pp = (await db.query('SELECT * FROM progress_points WHERE child_id=$1 ORDER BY recorded_at', [req.params.cid])).rows;
    const progress = {};
    pp.forEach((r) => { (progress[r.domain] ||= []).push({ date: r.recorded_at, value: r.value }); });
    const arow = (await db.query('SELECT * FROM assessments WHERE child_id=$1 ORDER BY date DESC LIMIT 1', [req.params.cid])).rows[0];
    res.status(201).json({ progress, assessment: S.assessmentOut(arow) });
  } catch (e) { next(e); }
});

// ---- standardised tools ----
router.post('/tools', async (req, res, next) => {
  try {
    const b = req.body || {};
    const { rows } = await db.query(
      `INSERT INTO assessment_tools (child_id, code, name, tool_date, result, notes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.cid, b.code || 'ASMT', b.name || 'Assessment', b.date || null, b.result || '', b.notes || '']
    );
    res.status(201).json(S.toolOut(rows[0]));
  } catch (e) { next(e); }
});

router.put('/tools/:tid', async (req, res, next) => {
  try {
    const b = req.body || {};
    const { rows } = await db.query(
      `UPDATE assessment_tools SET code=COALESCE($1,code), name=COALESCE($2,name),
         tool_date=COALESCE($3,tool_date), result=COALESCE($4,result), notes=COALESCE($5,notes), updated_at=now()
       WHERE id=$6 AND child_id=$7 RETURNING *`,
      [b.code ?? null, b.name ?? null, b.date ?? null, b.result ?? null, b.notes ?? null, req.params.tid, req.params.cid]
    );
    res.json(rows[0] ? S.toolOut(rows[0]) : null);
  } catch (e) { next(e); }
});

router.delete('/tools/:tid', async (req, res, next) => {
  try {
    await db.query('DELETE FROM assessment_tools WHERE id=$1 AND child_id=$2', [req.params.tid, req.params.cid]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
