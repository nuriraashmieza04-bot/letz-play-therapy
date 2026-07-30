'use strict';
const db = require('./db');

async function record({ txt, ico = 'activity', color = '#3B82F6', childId = null, actorId = null }) {
  try {
    await db.query(
      'INSERT INTO activities (txt, ico, color, child_id, actor_id, when_ms) VALUES ($1,$2,$3,$4,$5,$6)',
      [txt, ico, color, childId, actorId, Date.now()]
    );
  } catch (e) {
    console.error('[activity] failed:', e.message);
  }
}

module.exports = { record };
