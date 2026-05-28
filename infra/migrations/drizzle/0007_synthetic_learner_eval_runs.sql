CREATE TABLE IF NOT EXISTS synthetic_learner_eval_runs (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  fixture_manifest_id TEXT NOT NULL,
  fixture_version TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  scenario_run_count INTEGER NOT NULL DEFAULT 0,
  failed_scenario_count INTEGER NOT NULL DEFAULT 0,
  persona_coverage_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  scenario_coverage_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  notebook_refs_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  run_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS synthetic_learner_eval_runs_owner_idx
  ON synthetic_learner_eval_runs (owner_id, started_at);

CREATE INDEX IF NOT EXISTS synthetic_learner_eval_runs_notebook_idx
  ON synthetic_learner_eval_runs (notebook_id);
