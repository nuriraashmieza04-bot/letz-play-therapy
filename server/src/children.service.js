'use strict';
const db = require('./db');
const S = require('./shapes');

// Resolve parentId (a user row) for a child by its parent_email, if that parent has an account.
async function parentIdMap() {
  const { rows } = await db.query("SELECT id, lower(email) AS email FROM users WHERE role='parent'");
  const map = {};
  rows.forEach((r) => { map[r.email] = r.id; });
  return map;
}

// Full nested child (staff view: all clinical data).
async function assembleChildrenStaff(whereSql = '', params = []) {
  const pmap = await parentIdMap();
  const children = (await db.query(
    `SELECT * FROM children ${whereSql} ORDER BY created_at DESC`, params
  )).rows;
  if (!children.length) return [];
  const ids = children.map((c) => c.id);

  const goals = (await db.query('SELECT * FROM goals WHERE child_id = ANY($1) ORDER BY created_at', [ids])).rows;
  const sessions = (await db.query('SELECT * FROM soap_sessions WHERE child_id = ANY($1) AND is_draft = FALSE ORDER BY date DESC', [ids])).rows;
  const hps = (await db.query('SELECT * FROM home_programmes WHERE child_id = ANY($1) ORDER BY assigned DESC', [ids])).rows;
  const progress = (await db.query('SELECT * FROM progress_points WHERE child_id = ANY($1) ORDER BY recorded_at', [ids])).rows;
  const tools = (await db.query('SELECT * FROM assessment_tools WHERE child_id = ANY($1) ORDER BY tool_date DESC', [ids])).rows;
  const assessments = (await db.query(
    'SELECT DISTINCT ON (child_id) * FROM assessments WHERE child_id = ANY($1) ORDER BY child_id, date DESC', [ids]
  )).rows;

  const byChild = (arr) => arr.reduce((m, r) => ((m[r.child_id] ||= []).push(r), m), {});
  const g = byChild(goals), s = byChild(sessions), h = byChild(hps), p = byChild(progress), t = byChild(tools);
  const a = assessments.reduce((m, r) => ((m[r.child_id] = r), m), {});

  return children.map((c) => {
    const core = S.childCore(c);
    core.parentId = pmap[String(c.parent_email || '').toLowerCase()] || null;
    core.goals = (g[c.id] || []).map(S.goalOut);
    core.sessions = (s[c.id] || []).map(S.sessionOut);
    core.homeProgrammes = (h[c.id] || []).map(S.hpOut);
    core.tools = (t[c.id] || []).map(S.toolOut);
    core.assessment = S.assessmentOut(a[c.id]);
    core.progress = {};
    (p[c.id] || []).forEach((pt) => {
      (core.progress[pt.domain] ||= []).push({ date: pt.recorded_at, value: pt.value });
    });
    return core;
  });
}

// Parent view: limited to home programmes, progress, goals, and parent-safe session summaries.
async function assembleChildrenParent(parentEmail) {
  const pmap = await parentIdMap();
  const children = (await db.query(
    "SELECT * FROM children WHERE lower(parent_email) = lower($1) AND status='active' ORDER BY created_at DESC",
    [parentEmail]
  )).rows;
  if (!children.length) return [];
  const ids = children.map((c) => c.id);

  const goals = (await db.query('SELECT * FROM goals WHERE child_id = ANY($1) ORDER BY created_at', [ids])).rows;
  const sessions = (await db.query('SELECT * FROM soap_sessions WHERE child_id = ANY($1) AND is_draft = FALSE ORDER BY date DESC', [ids])).rows;
  const hps = (await db.query('SELECT * FROM home_programmes WHERE child_id = ANY($1) ORDER BY assigned DESC', [ids])).rows;
  const progress = (await db.query('SELECT * FROM progress_points WHERE child_id = ANY($1) ORDER BY recorded_at', [ids])).rows;

  const byChild = (arr) => arr.reduce((m, r) => ((m[r.child_id] ||= []).push(r), m), {});
  const g = byChild(goals), s = byChild(sessions), h = byChild(hps), p = byChild(progress);

  return children.map((c) => {
    const core = S.childCore(c);
    core.parentId = pmap[String(c.parent_email || '').toLowerCase()] || null;
    core.goals = (g[c.id] || []).map(S.goalOut);
    core.sessions = (s[c.id] || []).map(S.sessionParentOut);   // parent-safe only
    core.homeProgrammes = (h[c.id] || []).map(S.hpOut);
    core.tools = [];               // hidden from parents
    core.assessment = null;        // hidden from parents
    core.progress = {};
    (p[c.id] || []).forEach((pt) => {
      (core.progress[pt.domain] ||= []).push({ date: pt.recorded_at, value: pt.value });
    });
    return core;
  });
}

async function oneChildStaff(childId) {
  const list = await assembleChildrenStaff('WHERE id = $1', [childId]);
  return list[0] || null;
}

module.exports = { assembleChildrenStaff, assembleChildrenParent, oneChildStaff, parentIdMap };
