'use strict';
// Applies every .sql file in ../migrations in filename order.
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db');

// On hosting platforms the app container often starts before the database is
// accepting connections. Retry briefly instead of crash-looping the deploy.
async function waitForDb(attempts = 20, delayMs = 3000) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await pool.query('SELECT 1');
      if (i > 1) console.log(`Database reachable after ${i} attempts.`);
      return;
    } catch (e) {
      if (i === attempts) throw new Error(`Database unreachable after ${attempts} attempts: ${e.message}`);
      console.log(`Waiting for database (${i}/${attempts})… ${e.code || e.message}`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

async function run() {
  await waitForDb();
  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  if (!files.length) {
    console.log('No migration files found.');
    return;
  }
  for (const f of files) {
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    process.stdout.write(`Applying ${f} ... `);
    await pool.query(sql);
    console.log('done');
  }
  console.log('All migrations applied.');
}

run()
  .then(() => pool.end())
  .catch((e) => {
    console.error('Migration failed:', e.message);
    pool.end();
    process.exit(1);
  });
