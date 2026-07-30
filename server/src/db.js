'use strict';
const { Pool } = require('pg');
const config = require('./config');

const pool = config.databaseUrl
  ? new Pool({ connectionString: config.databaseUrl, ssl: config.pg.ssl })
  : new Pool(config.pg);

pool.on('error', (err) => {
  // Keep the process alive; log idle-client errors.
  console.error('[db] unexpected idle client error:', err.message);
});

async function query(text, params) {
  return pool.query(text, params);
}

// Run a set of statements inside a single transaction.
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, tx };
