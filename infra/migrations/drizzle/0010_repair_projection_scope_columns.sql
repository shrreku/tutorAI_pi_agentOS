-- Repair: 0009 was recorded but columns may be missing on existing Docker volumes.
ALTER TABLE "neo4j_projection_state"
  ADD COLUMN IF NOT EXISTS "last_projection_scope" text;

ALTER TABLE "neo4j_source_projection_state"
  ADD COLUMN IF NOT EXISTS "last_projection_scope" text,
  ADD COLUMN IF NOT EXISTS "last_source_version_id" text;
