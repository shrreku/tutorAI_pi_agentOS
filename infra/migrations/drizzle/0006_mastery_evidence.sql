CREATE TABLE IF NOT EXISTS mastery_evidence (
  id TEXT PRIMARY KEY,
  notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES tutor_sessions(id) ON DELETE SET NULL,
  turn_id TEXT REFERENCES tutor_turns(id) ON DELETE SET NULL,
  run_id TEXT REFERENCES agent_runs(id) ON DELETE SET NULL,
  evidence_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mastery_evidence_notebook_created_idx
  ON mastery_evidence (notebook_id, created_at DESC);

CREATE INDEX IF NOT EXISTS mastery_evidence_session_idx
  ON mastery_evidence (session_id, created_at DESC);
