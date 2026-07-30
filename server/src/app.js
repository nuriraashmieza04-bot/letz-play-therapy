'use strict';
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);

const config = require('./config');
const { pool } = require('./db');
const { attachUser, requireAuth, csrfProtection } = require('./auth');

const authRoutes = require('./routes/auth.routes');
const bootstrapRoutes = require('./routes/bootstrap.routes');
const childrenRoutes = require('./routes/children.routes');
const goalsRoutes = require('./routes/goals.routes');
const sessionRoutes = require('./routes/sessions.routes');
const hpRoutes = require('./routes/homeprogrammes.routes');
const assessmentRoutes = require('./routes/assessments.routes');
const progressRoutes = require('./routes/progress.routes');
const reportRoutes = require('./routes/reports.routes');
const userRoutes = require('./routes/users.routes');
const settingsRoutes = require('./routes/settings.routes');

const app = express();

if (config.trustProxy) app.set('trust proxy', 1);

// Security headers. CSP permits inline script/style because the SPA ships as a
// single self-contained HTML file with inline handlers and styles.
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'", "'unsafe-inline'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:'],
      'connect-src': ["'self'"],
      'font-src': ["'self'", 'data:'],
      'frame-ancestors': ["'self'"],
      'object-src': ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(compression());
app.use(express.json({ limit: '2mb' }));

app.use(session({
  name: 'lpt.sid',
  store: new PgSession({ pool, tableName: 'session', createTableIfMissing: false }),
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge: config.sessionMaxAgeMs,
  },
}));

app.use(attachUser);

// ---- health ----
app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ---- public auth (exempt from CSRF — no session/token exists yet at login) ----
app.use('/api/auth', authRoutes);

// CSRF protection applies to every state-changing request AFTER this point.
app.use(csrfProtection);

// ---- authenticated API ----
app.use('/api/bootstrap', requireAuth, bootstrapRoutes);
app.use('/api/settings', requireAuth, settingsRoutes);
app.use('/api/users', requireAuth, userRoutes);

app.use('/api/children/:cid/goals', requireAuth, goalsRoutes);
app.use('/api/children/:cid/soap', requireAuth, sessionRoutes);
app.use('/api/children/:cid/hp', requireAuth, hpRoutes);
app.use('/api/children/:cid/assessment', requireAuth, assessmentRoutes);
app.use('/api/children/:cid/progress', requireAuth, progressRoutes);
app.use('/api/children/:cid/reports', requireAuth, reportRoutes);
app.use('/api/children', requireAuth, childrenRoutes);

// ---- static frontend ----
const publicDir = path.join(__dirname, '..', '..', 'public');
app.use(express.static(publicDir, { index: 'index.html', maxAge: '1h', etag: true }));

// SPA fallback for any non-API route
app.get(/^(?!\/api\/).*/, (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// ---- 404 for unknown API ----
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// ---- error handler ----
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[error]', err.stack || err.message || err);
  const status = err.status || 500;
  res.status(status).json({ error: config.env === 'production' ? 'Server error' : (err.message || 'Server error') });
});

module.exports = app;
