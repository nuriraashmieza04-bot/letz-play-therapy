'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const cron = require('node-cron');
const config = require('./config');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Build the environment/args for pg_dump from config.
function pgDumpArgs() {
  const args = ['-Fc']; // custom format (compressed, restorable with pg_restore)
  const env = { ...process.env };
  if (config.databaseUrl) {
    args.push(config.databaseUrl);
  } else {
    args.push('-h', config.pg.host, '-p', String(config.pg.port), '-U', config.pg.user, config.pg.database);
    if (config.pg.password) env.PGPASSWORD = config.pg.password;
  }
  return { args, env };
}

function runBackup() {
  return new Promise((resolve, reject) => {
    ensureDir(config.backup.dir);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(config.backup.dir, `lpt_connect_${stamp}.dump`);
    const out = fs.createWriteStream(file);
    const { args, env } = pgDumpArgs();
    const proc = spawn(config.backup.pgDump, args, { env });
    proc.stdout.pipe(out);
    let err = '';
    proc.stderr.on('data', (d) => (err += d.toString()));
    proc.on('error', (e) => reject(new Error(`pg_dump not runnable (${e.message}). Set PG_DUMP_PATH.`)));
    proc.on('close', (code) => {
      out.close();
      if (code === 0) {
        pruneOld();
        console.log(`[backup] wrote ${file}`);
        resolve(file);
      } else {
        try { fs.unlinkSync(file); } catch (_) {}
        reject(new Error(`pg_dump exited ${code}: ${err.trim()}`));
      }
    });
  });
}

function pruneOld() {
  try {
    const files = fs.readdirSync(config.backup.dir)
      .filter((f) => f.startsWith('lpt_connect_') && f.endsWith('.dump'))
      .map((f) => ({ f, t: fs.statSync(path.join(config.backup.dir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    files.slice(config.backup.retention).forEach((x) => {
      fs.unlinkSync(path.join(config.backup.dir, x.f));
    });
  } catch (e) {
    console.error('[backup] prune failed:', e.message);
  }
}

// pg_dump ships with the postgresql client, which isn't present in every base
// image (e.g. Railway/Nixpacks). Detect it so we fail loudly once at boot rather
// than silently every night.
function pgDumpAvailable() {
  const r = require('child_process').spawnSync(config.backup.pgDump, ['--version']);
  return !r.error && r.status === 0;
}

function schedule() {
  if (!config.backup.enabled) {
    console.log('[backup] disabled (BACKUP_ENABLED=false)');
    return;
  }
  if (!pgDumpAvailable()) {
    console.warn(
      '[backup] pg_dump not found — scheduled backups are DISABLED.\n' +
      '         On Railway/Render use the platform\'s own managed database backups,\n' +
      '         or set BACKUP_ENABLED=false to silence this. On your own server,\n' +
      '         install the postgresql-client package (or set PG_DUMP_PATH).'
    );
    return;
  }
  if (!cron.validate(config.backup.cron)) {
    console.error('[backup] invalid BACKUP_CRON, backups not scheduled');
    return;
  }
  cron.schedule(config.backup.cron, () => {
    runBackup().catch((e) => console.error('[backup] failed:', e.message));
  });
  console.log(`[backup] scheduled (${config.backup.cron}) -> ${config.backup.dir}`);
}

module.exports = { runBackup, schedule };
