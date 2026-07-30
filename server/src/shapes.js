'use strict';
// Map DB rows -> the exact object shape the existing frontend expects.
// The frontend revives ISO date strings back into Date objects on the client.

function therapistOut(u) {
  return {
    id: u.id,
    name: u.name,
    title: u.title || 'Therapist',
    spec: u.spec || '',
    email: u.email,
    initials: u.initials || '',
    color: u.color || '#3B82F6',
    role: u.role,
  };
}

function parentOut(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    initials: u.initials || '',
    color: u.color || '#3B82F6',
    role: 'parent',
  };
}

function goalOut(g) {
  return {
    id: g.id,
    title: g.title,
    domain: g.domain,
    target: g.target,
    progress: g.progress,
    status: g.status,
    started: g.started,
  };
}

function sessionOut(s) {
  return {
    id: s.id,
    childId: s.child_id,
    therapistId: s.therapist_id,
    date: s.date,
    duration: s.duration,
    subjective: s.subjective,
    objective: s.objective,
    assessment: s.assessment,
    plan: s.plan,
    activities: s.activities || [],
    response: s.response,
    observation: s.observation,
    parentSummary: s.parent_summary,
    homeProgramme: s.home_programme,
    nextPlan: s.next_plan,
    goalsWorked: s.goals_worked || [],
    signed: s.signed,
    signedBy: s.signed_by || undefined,
    isDraft: s.is_draft,
  };
}

// Parent-safe projection: only the fields a parent is allowed to see.
function sessionParentOut(s) {
  return {
    id: s.id,
    date: s.date,
    duration: s.duration,
    parentSummary: s.parent_summary,
    homeProgramme: s.home_programme,
    goalsWorked: s.goals_worked || [],
    signed: s.signed,
    // clinical fields intentionally omitted:
    subjective: '', objective: '', assessment: '', plan: '',
    activities: [], response: '', observation: '', nextPlan: '',
  };
}

function hpOut(h) {
  return {
    id: h.id,
    childId: h.child_id,
    t: h.title,
    obj: h.objective,
    mat: h.materials,
    instr: h.instructions,
    freq: h.frequency,
    out: h.outcome,
    completion: h.completion,
    status: h.status,
    assigned: h.assigned,
    therapistId: h.assigned_by,
  };
}

function toolOut(t) {
  return {
    id: t.id,
    code: t.code,
    name: t.name,
    date: t.tool_date,
    result: t.result,
    notes: t.notes,
  };
}

function assessmentOut(a) {
  if (!a) return null;
  return { date: a.date, answers: a.answers || {}, scores: a.scores || {}, done: a.done };
}

function childCore(c) {
  return {
    id: c.id,
    name: c.name,
    gender: c.gender,
    dob: c.dob,
    diagnosis: c.diagnosis,
    therapistId: c.therapist_id,
    parentEmail: c.parent_email,
    parentName: c.parent_name,
    parentId: c.parent_id || null,
    initials: c.initials,
    color: c.color,
    status: c.status,
    startDate: c.start_date,
    referral: c.referral,
    address: c.address,
  };
}

function activityOut(a) {
  return { txt: a.txt, ico: a.ico, color: a.color, when: Number(a.when_ms), childId: a.child_id };
}

module.exports = {
  therapistOut, parentOut, goalOut, sessionOut, sessionParentOut,
  hpOut, toolOut, assessmentOut, childCore, activityOut,
};
