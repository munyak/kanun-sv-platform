-- ============================================================
-- KaNun Academy — Progress Tracking Tables
-- Migration: 0009_academy_tables
-- ============================================================

-- Tracks which domains/topics a user has studied
CREATE TABLE IF NOT EXISTS academy_progress (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id      UUID NOT NULL REFERENCES sv_organizations(id) ON DELETE CASCADE,
  domain_id   INT NOT NULL,
  topic       TEXT NOT NULL,
  completed   BOOLEAN DEFAULT FALSE,
  score       NUMERIC(4,2),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, org_id, domain_id, topic)
);

-- Stores scenario attempt history
CREATE TABLE IF NOT EXISTS academy_scenario_attempts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES sv_organizations(id) ON DELETE CASCADE,
  domain_id       INT NOT NULL,
  difficulty      TEXT NOT NULL CHECK (difficulty IN ('easy','medium','hard')),
  scenario_title  TEXT,
  response_text   TEXT,
  score_safety         NUMERIC(3,1),
  score_boundaries     NUMERIC(3,1),
  score_documentation  NUMERIC(3,1),
  score_deescalation   NUMERIC(3,1),
  score_overall        NUMERIC(3,1),
  passed          BOOLEAN DEFAULT FALSE,
  feedback        TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Stores quiz attempt history
CREATE TABLE IF NOT EXISTS academy_quiz_attempts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES sv_organizations(id) ON DELETE CASCADE,
  domain_id       INT,
  difficulty      TEXT NOT NULL CHECK (difficulty IN ('easy','medium','hard')),
  question_count  INT NOT NULL,
  correct_count   INT NOT NULL,
  percentage      NUMERIC(5,2),
  passed          BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Stores tutor conversation summaries (not full transcripts)
CREATE TABLE IF NOT EXISTS academy_tutor_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id      UUID NOT NULL REFERENCES sv_organizations(id) ON DELETE CASCADE,
  domains_discussed TEXT[], -- array of domain names covered
  message_count INT DEFAULT 0,
  summary     TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Certification tier tracking
CREATE TABLE IF NOT EXISTS academy_certifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id      UUID NOT NULL REFERENCES sv_organizations(id) ON DELETE CASCADE,
  tier        TEXT NOT NULL CHECK (tier IN ('KCM','KACM','KMM')),
  status      TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','exam_ready','certified','expired')),
  started_at  TIMESTAMPTZ DEFAULT now(),
  certified_at TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ,
  credential_id TEXT, -- Open Badge credential ID
  UNIQUE(user_id, org_id, tier)
);

-- Row-level security
ALTER TABLE academy_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_scenario_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_tutor_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_certifications ENABLE ROW LEVEL SECURITY;

-- Policies: users can read/write their own records; owners can read all in their org
CREATE POLICY "Users can manage own progress"
  ON academy_progress FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own scenario attempts"
  ON academy_scenario_attempts FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own quiz attempts"
  ON academy_quiz_attempts FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own tutor sessions"
  ON academy_tutor_sessions FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own certifications"
  ON academy_certifications FOR ALL
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_academy_progress_user ON academy_progress(user_id, org_id);
CREATE INDEX IF NOT EXISTS idx_academy_scenarios_user ON academy_scenario_attempts(user_id, org_id);
CREATE INDEX IF NOT EXISTS idx_academy_quizzes_user ON academy_quiz_attempts(user_id, org_id);
CREATE INDEX IF NOT EXISTS idx_academy_certs_user ON academy_certifications(user_id, org_id);
