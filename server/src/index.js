'use strict';
const app = require('./app');
const config = require('./config');
const backup = require('./backup');
const { pool } = require('./db');

// ---- production sanity checks ----
if (config.env === 'production') {
  const problems = [];
  if (!config.databaseUrl && (!config.pg.host || !config.pg.database)) problems.push('Database connection is not configured (set DATABASE_URL or PG* vars).');
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'change-me-in-production-please') problems.push('SESSION_SECRET must be set to a strong random value.');
  if (!config.cookieSecure) console.warn('[warn] COOKIE_SECURE is false — set it to true when serving over HTTPS.');
  if (problems.length) {
    console.error(
      '\n============================================================\n' +
      ' LPT Connect cannot start — required configuration missing:\n' +
      '   - ' + problems.join('\n   - ') +
      '\n\n Set these as environment variables on your host.\n' +
      ' On Railway: project -> your service -> "Variables".\n' +
      ' Generate a session secret with:\n' +
      '   node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"\n' +
      '============================================================\n'
    );
    process.exit(1);
  }
}

const server = app.listen(config.port, () => {
  console.log(`LPT Connect server listening on :${config.port} (${config.env})`);
  backup.schedule();
});

// graceful shutdown
function shutdown() {
  console.log('Shutting down...');
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(0), 8000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
