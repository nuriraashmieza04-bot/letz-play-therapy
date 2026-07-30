-- LPT Connect — initial schema
-- Safe to run repeatedly (IF NOT EXISTS guards).

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Users (admin / therapist / parent)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role          TEXT NOT NULL CHECK (role IN ('admin','therapist','parent')),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  title         TEXT,                       -- therapist role/title
  spec          TEXT,                       -- therapist speciality
  color         TEXT DEFAULT '#3B82F6',
  initials      TEXT,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (lower(email));
CREATE INDEX IF NOT EXISTS idx_users_role  ON users (role);

-- ---------------------------------------------------------------------------
-- Children (caseload). Parent linkage is by email (a parent may have siblings).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS children (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  gender        TEXT,
  dob           DATE,
  diagnosis     TEXT,
  referral      TEXT,
  address       TEXT,
  therapist_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  parent_email  TEXT,
  parent_name   TEXT,
  color         TEXT DEFAULT '#3B82F6',
  initials      TEXT,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  start_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_children_therapist ON children (therapist_id);
CREATE INDEX IF NOT EXISTS idx_children_parent    ON children (lower(parent_email));
CREATE INDEX IF NOT EXISTS idx_children_status    ON children (status);

-- ---------------------------------------------------------------------------
-- Goals
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS goals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id    UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  domain      TEXT,
  target      INTEGER DEFAULT 80,
  progress    INTEGER DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','achieved','paused')),
  started     DATE DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_goals_child ON goals (child_id);

-- ---------------------------------------------------------------------------
-- SOAP sessions (named soap_sessions to avoid clash with the auth "session" table)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS soap_sessions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id              UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  therapist_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  date                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration              INTEGER DEFAULT 45,
  subjective            TEXT,
  objective             TEXT,
  assessment            TEXT,
  plan                  TEXT,
  activities            JSONB DEFAULT '[]'::jsonb,   -- array of strings
  response              TEXT,
  observation           TEXT,
  parent_summary        TEXT,
  home_programme        TEXT,
  next_plan             TEXT,
  goals_worked          JSONB DEFAULT '[]'::jsonb,   -- array of domain strings
  signature             TEXT,
  signed                BOOLEAN NOT NULL DEFAULT FALSE,
  is_draft              BOOLEAN NOT NULL DEFAULT TRUE, -- autosave drafts start here
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_soap_child ON soap_sessions (child_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_soap_draft ON soap_sessions (is_draft);

-- ---------------------------------------------------------------------------
-- Home programmes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS home_programmes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id     UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,          -- "t" on the frontend
  objective    TEXT,                   -- "obj"
  materials    TEXT,                   -- "mat"
  instructions TEXT,                   -- "instr"
  frequency    TEXT,                   -- "freq"
  outcome      TEXT,                   -- "out"
  completion   INTEGER DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','archived')),
  assigned_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hp_child ON home_programmes (child_id);

-- ---------------------------------------------------------------------------
-- Progress points (one row per domain measurement)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS progress_points (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id    UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  domain      TEXT NOT NULL,
  value       INTEGER NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_progress_child ON progress_points (child_id, domain, recorded_at);

-- ---------------------------------------------------------------------------
-- Developmental baseline assessment (questionnaire). Latest row per child = current.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assessments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id     UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  therapist_id UUID REFERENCES users(id) ON DELETE SET NULL,
  date         TIMESTAMPTZ NOT NULL DEFAULT now(),
  answers      JSONB NOT NULL DEFAULT '{}'::jsonb,   -- { domain: [0..4 x5] }
  scores       JSONB NOT NULL DEFAULT '{}'::jsonb,   -- { domain: pct }
  done         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assessment_child ON assessments (child_id, date DESC);

-- ---------------------------------------------------------------------------
-- Standardised assessment tools (FEAS, SRS-2, SGS-2, SPM-2, custom)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assessment_tools (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id    UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  code        TEXT,
  name        TEXT,
  tool_date   DATE,
  result      TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tools_child ON assessment_tools (child_id);

-- ---------------------------------------------------------------------------
-- Generated & stored PDF reports
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id     UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  generated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  filename     TEXT NOT NULL,
  mime         TEXT NOT NULL DEFAULT 'application/pdf',
  bytes        INTEGER,
  pdf          BYTEA NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reports_child ON reports (child_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Clinic settings (single row)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clinic_settings (
  id       INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  name     TEXT,
  tagline  TEXT,
  address  TEXT,
  phone    TEXT,
  email    TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Activity feed
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activities (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  txt        TEXT NOT NULL,
  ico        TEXT DEFAULT 'activity',
  color      TEXT DEFAULT '#3B82F6',
  child_id   UUID REFERENCES children(id) ON DELETE CASCADE,
  actor_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  when_ms    BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activities_when ON activities (when_ms DESC);

-- ---------------------------------------------------------------------------
-- Session store for express-session / connect-pg-simple
-- (matches the table connect-pg-simple expects)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "session" (
  "sid"    varchar NOT NULL COLLATE "default",
  "sess"   json NOT NULL,
  "expire" timestamp(6) NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
