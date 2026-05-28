CREATE TABLE IF NOT EXISTS learner_trait_signals (
  id TEXT PRIMARY KEY,
  notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  trait TEXT NOT NULL,
  signal_json JSONB NOT NULL,
  evidence_refs_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  session_id TEXT,
  turn_id TEXT,
  run_id TEXT,
  observed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS learner_trait_signals_notebook_user_created_idx
  ON learner_trait_signals (notebook_id, user_id, created_at);

CREATE INDEX IF NOT EXISTS learner_trait_signals_session_idx
  ON learner_trait_signals (session_id, created_at);

CREATE INDEX IF NOT EXISTS learner_trait_signals_trait_idx
  ON learner_trait_signals (notebook_id, user_id, trait);

CREATE TABLE IF NOT EXISTS learner_trait_estimates (
  id TEXT PRIMARY KEY,
  notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trait TEXT NOT NULL,
  target_ref_type TEXT NOT NULL DEFAULT 'notebook',
  target_ref_id TEXT NOT NULL DEFAULT 'notebook',
  lane TEXT NOT NULL,
  confidence REAL NOT NULL,
  estimate_json JSONB NOT NULL,
  evidence_refs_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  contradiction_refs_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  guardrail_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS learner_trait_estimates_current_unique
  ON learner_trait_estimates (notebook_id, user_id, trait, target_ref_type, target_ref_id);

CREATE INDEX IF NOT EXISTS learner_trait_estimates_notebook_user_idx
  ON learner_trait_estimates (notebook_id, user_id);
