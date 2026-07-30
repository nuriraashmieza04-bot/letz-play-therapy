'use strict';
const express = require('express');
const db = require('../db');
const S = require('../shapes');
const activity = require('../activity');
const { requireStaff, requireChildAccess } = require('../permissions');

// SOAP notes are clinical — staff only (therapists see ALL notes incl. colleagues').
const router = express.Router({ mergeParams: true });
router.use(requireStaff, requireChildAccess('cid'));

function payload(b) {
  return {
    duration: b.duration ?? 45,
    subjective: b.subjective ?? '',
    objective: b.objective ?? '',
    assessment: b.assessment ?? '',
    plan: b.plan ?? '',
    activities: JSON.stringify(Array.isArray(b.activities) ? b.activities
      : String(b.activities || '').split('\n').map((x) => x.trim()).filter(Boolean)),
    response: b.response ?? '',
    observation: b.observation ?? '',
    parent_summary: b.parentSummary ?? '',
    home_programme: b.homeProgramme ?? '',
    next_plan: b.nextPlan ?? '',
    goals_worked: JSON.stringify(Array.isArray(b.goalsWorked) ? b.goalsWorked : []),
  };
}

async function fetchOne(id) {
  const { rows } = await db.query('SELECT * FROM soap_sessions WHERE id=$1', [id]);
  return rows[0] ? S.sessionOut(rows[0]) : null;
}

// GET all sessions for a child
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM soap_sessions WHERE child_id=$1 AND is_draft=FALSE ORDER BY date DESC', [req.params.cid]);
    res.json(rows.map(S.sessionOut));
  } catch (e) { next(e); }
});

// POST create a DRAFT (used by the autosave flow when a new session editor opens)
router.post('/draft', async (req, res, next) => {
  try {
    const p = payload(req.body || {});
    const { rows } = await db.query(
      `INSERT INTO soap_sessions
        (child_id, therapist_id, date, duration, subjective, objective, assessment, plan,
         activities, response, observation, parent_summary, home_programme, next_plan, goals_worked, signed, is_draft)
       VALUES ($1,$2, now(), $3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, FALSE, TRUE) RETURNING id`,
      [req.params.cid, req.user.id, p.duration, p.subjective, p.objective, p.assessment, p.plan,
       p.activities, p.response, p.observation, p.parent_summary, p.home_programme, p.next_plan, p.goals_worked]
    );
    res.status(201).json(await fetchOne(rows[0].id));
  } catch (e) { next(e); }
});

// PATCH autosave a draft (or an existing session) — does not sign
router.patch('/:sid', async (req, res, next) => {
  try {
    const p = payload(req.body || {});
    await db.query(
      `UPDATE soap_sessions SET duration=$1, subjective=$2, objective=$3, assessment=$4, plan=$5,
         activities=$6, response=$7, observation=$8, parent_summary=$9, home_programme=$10,
         next_plan=$11, goals_worked=$12, updated_at=now()
       WHERE id=$13 AND child_id=$14`,
      [p.duration, p.subjective, p.objective, p.assessment, p.plan, p.activities, p.response,
       p.observation, p.parent_summary, p.home_programme, p.next_plan, p.goals_worked, req.params.sid, req.params.cid]
    );
    res.json(await fetchOne(req.params.sid));
  } catch (e) { next(e); }
});

// POST finalise: sign a session (promotes a draft to a permanent signed note) and
// nudges progress on the worked domains. If sid provided, that draft is signed; else create new.
router.post('/', async (req, res, next) => {
  try {
    const p = payload(req.body || {});
    const signedBy = req.user.name;
    let sid = req.body.sid || null;

    if (sid) {
      await db.query(
        `UPDATE soap_sessions SET duration=$1, subjective=$2, objective=$3, assessment=$4, plan=$5,
           activities=$6, response=$7, observation=$8, parent_summary=$9, home_programme=$10,
           next_plan=$11, goals_worked=$12, signed=TRUE, is_draft=FALSE, signature=$13, updated_at=now()
         WHERE id=$14 AND child_id=$15`,
        [p.duration, p.subjective, p.objective, p.assessment, p.plan, p.activities, p.response,
         p.observation, p.parent_summary, p.home_programme, p.next_plan, p.goals_worked, signedBy, sid, req.params.cid]
      );
    } else {
      const { rows } = await db.query(
        `INSERT INTO soap_sessions
          (child_id, therapist_id, date, duration, subjective, objective, assessment, plan,
           activities, response, observation, parent_summary, home_programme, next_plan, goals_worked, signed, is_draft, signature)
         VALUES ($1,$2, now(), $3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, TRUE, FALSE, $15) RETURNING id`,
        [req.params.cid, req.user.id, p.duration, p.subjective, p.objective, p.assessment, p.plan,
         p.activities, p.response, p.observation, p.parent_summary, p.home_programme, p.next_plan, p.goals_worked, signedBy]
      );
      sid = rows[0].id;
    }

    // nudge progress on worked domains that already have a baseline
    const worked = Array.isArray(req.body.goalsWorked) ? req.body.goalsWorked : [];
    for (const domain of worked) {
      const { rows } = await db.query(
        'SELECT value FROM progress_points WHERE child_id=$1 AND domain=$2 ORDER BY recorded_at DESC LIMIT 1',
        [req.params.cid, domain]
      );
      if (rows[0]) {
        const nv = Math.min(98, rows[0].value + 1 + Math.floor(Math.random() * 4));
        await db.query('INSERT INTO progress_points (child_id, domain, value, recorded_at) VALUES ($1,$2,$3, now())',
          [req.params.cid, domain, nv]);
      }
    }

    const child = (await db.query('SELECT name FROM children WHERE id=$1', [req.params.cid])).rows[0];
    await activity.record({ txt: `SOAP session documented for ${child.name}`, ico: 'soap', color: '#3B82F6', childId: req.params.cid, actorId: req.user.id });

    // return the signed session plus refreshed progress for the client to merge
    const session = await fetchOne(sid);
    const pp = (await db.query('SELECT * FROM progress_points WHERE child_id=$1 ORDER BY recorded_at', [req.params.cid])).rows;
    const progress = {};
    pp.forEach((r) => { (progress[r.domain] ||= []).push({ date: r.recorded_at, value: r.value }); });
    res.status(201).json({ session, progress });
  } catch (e) { next(e); }
});

// DELETE a session
router.delete('/:sid', async (req, res, next) => {
  try {
    await db.query('DELETE FROM soap_sessions WHERE id=$1 AND child_id=$2', [req.params.sid, req.params.cid]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
