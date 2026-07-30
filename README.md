# LPT Connect — Production System

A pediatric-therapy clinical documentation platform. The original single-file
`index.html` UI is **unchanged**; it now runs on a real backend:

- **PostgreSQL** for all data (children, SOAP notes, goals, home programmes, progress, assessments, reports).
- **Secure Express API** — hashed passwords (bcrypt), server-side sessions, CSRF protection, rate-limited auth, Helmet security headers.
- **Real authentication & roles** — Admin, Therapist, Parent.
- **Shared data** across every user and device.
- **Role-based permissions** — therapists see *all* clinical notes (including other therapists'); parents are limited to their own child's home programmes, progress, goals and reports (no clinical SOAP notes or assessments).
- **Auto-saved SOAP sessions** (draft autosave while typing).
- **Server-generated, stored PDF reports** (saved in the database, downloadable any time).
- **Automatic database backups** (scheduled `pg_dump`).
- **Deployable on your own hosting** (Docker, or bare-metal + nginx).

---

## 1. What's in the box

```
lpt-connect/
  server/                 Node/Express backend
    src/                  app, routes, auth, pdf, backups
    migrations/           SQL schema (001_init.sql)
    scripts/              migrate.js, seed.js, backup.js
    .env.example          copy to .env and fill in
  public/                 the frontend (served by Express)
    index.html            your original UI (unmodified) + one loader line
    app-api.js            the data layer that connects the UI to the API
  Dockerfile
  docker-compose.yml      app + postgres, one command to run
  nginx.conf              sample reverse proxy (+ HTTPS notes)
  backups/                backups land here
```

The frontend change is deliberately minimal: two `<script>` lines were added at
the end of `index.html`. `app-api.js` overrides only the data/persistence
functions (login, save, etc.) to call the API. **No screen, style, colour or
workflow was changed.**

---

## 2. Deploying to a host (Railway / Render)

See **DEPLOY.md** for the hosting walkthrough, including the Railway build
settings and the fixes for common deploy failures.

## 3. Quickest start — Docker (recommended)

Requires Docker + Docker Compose.

```bash
cd lpt-connect

# 1) create an env file with a strong session secret
cp server/.env.example .env
# edit .env: set SESSION_SECRET (and PGPASSWORD). Generate a secret with:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 2) build & start (migrations run automatically on boot)
docker compose up -d --build

# 3) load the sample clinic (optional but recommended for first run)
docker compose exec app npm run seed

# open http://localhost:4000
```

To put it on the internet, run nginx in front (see `nginx.conf`), point your
domain at the server, add TLS (below), and set `COOKIE_SECURE=true` and
`TRUST_PROXY=true` in `.env`.

---

## 3. Bare-metal install (no Docker)

**Prerequisites:** Node.js 18+, PostgreSQL 14+ (16 recommended), and the
`pg_dump` client on the server (for backups).

```bash
# 1) create the database and a user
sudo -u postgres psql -c "CREATE USER lpt WITH PASSWORD 'a-strong-password';"
sudo -u postgres psql -c "CREATE DATABASE lpt_connect OWNER lpt;"

# 2) configure
cd lpt-connect/server
cp .env.example .env
#   set PGUSER/PGPASSWORD/PGDATABASE (or DATABASE_URL),
#   set a strong SESSION_SECRET, COOKIE_SECURE=true (if HTTPS), TRUST_PROXY=true

# 3) install, migrate, seed
npm install
npm run migrate
npm run seed          # optional sample data

# 4) run
npm start             # listens on PORT (default 4000)
```

### Keep it running (PM2)

```bash
npm install -g pm2
pm2 start src/index.js --name lpt-connect
pm2 save && pm2 startup     # restart on reboot
```

### nginx + HTTPS

Copy `nginx.conf` to `/etc/nginx/sites-available/lpt-connect`, edit the
`server_name`, symlink into `sites-enabled`, then:

```bash
sudo certbot --nginx -d lpt.example.com     # obtain + install a certificate
```

Enable the HTTPS block in the config, reload nginx, and set `COOKIE_SECURE=true`
and `TRUST_PROXY=true` in `.env`.

---

## 4. Default seeded logins

After `npm run seed`, every account uses the password **`demo1234`**:

| Role      | Email                                                        |
|-----------|--------------------------------------------------------------|
| Admin     | `admin@lptclinic.com`                                        |
| Therapist | `sarah@lptclinic.com` (also rachel/michael/priya/james@lptclinic.com) |
| Parent    | `aisha@family.com` (also ben/carmen/… @family.com)           |

> **Change these immediately.** Admins can reset any password from
> **Settings → User Management**, or set a different seed password with
> `SEED_PASSWORD=... npm run seed`. To start empty instead, skip the seed step.

At the login screen, use the **Therapist / Parent** toggle. Admins sign in with
the Therapist toggle and get the full therapist workspace plus a **User
Management** tab in Settings.

---

## 5. How the pieces map to your requirements

- **PostgreSQL storage** — schema in `server/migrations/001_init.sql`.
- **Secure API** — `server/src/app.js` (Helmet, sessions, CSRF, rate limiting).
- **Authentication (Admin/Therapist/Parent)** — `server/src/auth.js`, `routes/auth.routes.js`.
- **Shared data** — everyone reads/writes the same database via the API.
- **Therapists see all notes; parents limited** — `server/src/permissions.js` and the parent-safe projection in `server/src/shapes.js` (`sessionParentOut`).
- **CRUD** — routes for children, goals, SOAP (`soap`), home programmes (`hp`), progress, assessments, reports.
- **Auto-save sessions** — SOAP draft autosave (`POST /soap/draft` + `PATCH`), wired in `public/app-api.js`; signing promotes the draft to a permanent note (no duplicates).
- **PDF reports generated & stored** — `server/src/pdf.js` builds the PDF, `reports` table stores it, download via `GET /api/children/:id/reports/:rid/download`.
- **Password hashing** — bcrypt (`BCRYPT_ROUNDS`, default 12).
- **Session management** — `express-session` + `connect-pg-simple` (sessions persisted in Postgres; rolling 12h expiry, httpOnly SameSite=Lax cookie).
- **Role-based permissions** — enforced server-side on every route.
- **Automatic backups** — `server/src/backup.js` (node-cron `pg_dump`, retention prune).

### Note on the two PDF paths
The **Print report** button still uses the browser's print dialog to produce the
exact pixel-styled A4 report you already had. The **Export PDF** button now also
**generates and stores** a PDF on the server (so there is a permanent copy in the
database) and downloads it. The stored server PDF is laid out by the backend and
is intentionally a clean clinical document; it won't be byte-identical to the
browser print, but both are retained.

---

## 6. Backups

- Scheduled automatically (default **daily 02:00**, `BACKUP_CRON`) to `BACKUP_DIR`
  (mounted to `./backups` in Docker), keeping the newest `BACKUP_RETENTION` files.
- Run one on demand:
  ```bash
  cd server && npm run backup      # bare-metal
  docker compose exec app npm run backup   # docker
  ```
- Backups use `pg_dump -Fc` (custom format). **Restore** with:
  ```bash
  pg_restore --clean --if-exists -d "$DATABASE_URL" backups/lpt_connect_YYYY-....dump
  ```
- Keep off-site copies of the `backups/` directory.

---

## 7. Security checklist for production

- [ ] Strong, unique `SESSION_SECRET`.
- [ ] Serve over HTTPS; set `COOKIE_SECURE=true` and `TRUST_PROXY=true`.
- [ ] Change all seeded passwords (or don't seed).
- [ ] Strong database password; database not exposed to the public internet.
- [ ] Regular, tested, off-site backups.
- [ ] Keep Node and dependencies patched.

---

## 8. Configuration reference

All settings live in `server/.env` (see `.env.example`). Key ones: `DATABASE_URL`
or `PG*`, `SESSION_SECRET`, `SESSION_MAX_AGE_HOURS`, `COOKIE_SECURE`,
`TRUST_PROXY`, `BCRYPT_ROUNDS`, `BACKUP_ENABLED/CRON/DIR/RETENTION`,
`PG_DUMP_PATH`, and the `CLINIC_*` identity fields printed on reports.

---

## 9. What was verified

This build was tested against a live PostgreSQL 16 database: schema migration,
seeding, and a 37-check end-to-end suite covering therapist/parent/admin login,
role-scoped data loading, child CRUD, developmental assessment, SOAP draft
autosave + signing (no duplicates, progress nudged), goals, home programmes,
standardised tools, PDF generation + storage + download, bcrypt password
hashing, and every permission boundary (parents blocked from clinical notes and
other families; non-admins blocked from user management). `pg_dump` backups were
confirmed to produce valid restorable archives.

You must supply your own database and secrets in production.
