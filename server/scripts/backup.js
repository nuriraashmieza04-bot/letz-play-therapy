'use strict';
const { runBackup } = require('../src/backup');
runBackup()
  .then((f) => { console.log('Backup complete:', f); process.exit(0); })
  .catch((e) => { console.error('Backup failed:', e.message); process.exit(1); });
