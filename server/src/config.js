'use strict';
require('dotenv').config();

function required(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') {
    if (fallback !== undefined) return fallback;
    // Do not throw at import time for optional-in-dev values; index.js validates critical ones.
    return undefined;
  }
  return v;
}

// Managed Postgres (Railway public proxy, Neon, Supabase, Render, Heroku…) requires
// TLS, while local/in-cluster databases usually don't. Detect rather than force,
// so the same build works locally, in Docker and on a hosting platform.
function detectSsl() {
  if (process.env.PGSSL === 'true') return { rejectUnauthorized: false };
  if (process.env.PGSSL === 'false') return false;
  const url = process.env.DATABASE_URL || '';
  if (!url) return false;
  if (/sslmode=require|sslmode=prefer/i.test(url)) return { rejectUnauthorized: false };
  let host = '';
  try { host = new URL(url).hostname; } catch (_) { return false; }
  // Local or platform-internal networking -> plaintext is fine.
  const internal = /^(localhost|127\.0\.0\.1|::1|db|postgres)$/i.test(host)
    || /\.internal$|\.local$|^10\.|^172\.(1[6-9]|2\d|3[01])\.|^192\.168\./.test(host);
  return internal ? false : { rejectUnauthorized: false };
}

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4000', 10),

  // PostgreSQL — either provide DATABASE_URL, or the individual PG* vars.
  databaseUrl: process.env.DATABASE_URL,
  pg: {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432', 10),
    user: process.env.PGUSER || 'lpt',
    password: process.env.PGPASSWORD || 'lpt',
    database: process.env.PGDATABASE || 'lpt_connect',
    ssl: detectSsl(),
  },

  // Session / security
  sessionSecret: required('SESSION_SECRET', 'change-me-in-production-please'),
  sessionMaxAgeMs: parseInt(process.env.SESSION_MAX_AGE_HOURS || '12', 10) * 60 * 60 * 1000,
  cookieSecure: process.env.COOKIE_SECURE === 'true', // set true when served over HTTPS
  trustProxy: process.env.TRUST_PROXY === 'true',

  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),

  // Backups
  backup: {
    enabled: process.env.BACKUP_ENABLED !== 'false',
    cron: process.env.BACKUP_CRON || '0 2 * * *', // 02:00 daily
    dir: process.env.BACKUP_DIR || require('path').join(__dirname, '..', '..', 'backups'),
    retention: parseInt(process.env.BACKUP_RETENTION || '14', 10), // keep N most recent
    pgDump: process.env.PG_DUMP_PATH || 'pg_dump',
  },

  // Clinic identity used on generated PDF reports (editable by admin via API too)
  clinic: {
    name: process.env.CLINIC_NAME || "Let'z Play Therapy",
    tagline: process.env.CLINIC_TAGLINE || 'Pediatric Occupational · Speech · Physiotherapy',
    address: process.env.CLINIC_ADDRESS || '24 Wellness Way, Suite 300',
    phone: process.env.CLINIC_PHONE || '+60 3-2100 4400',
    email: process.env.CLINIC_EMAIL || 'care@lptclinic.com',
  },
};

module.exports = config;
