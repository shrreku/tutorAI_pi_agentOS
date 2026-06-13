CREATE TABLE IF NOT EXISTS "generation_jobs" (
  "id" text PRIMARY KEY NOT NULL,
  "job_name" text NOT NULL,
  "notebook_id" text NOT NULL REFERENCES "notebooks"("id") ON DELETE CASCADE,
  "idempotency_key" text NOT NULL,
  "target_type" text,
  "generation_mode" text,
  "trigger" text,
  "status" text DEFAULT 'queued' NOT NULL,
  "priority" integer DEFAULT 0 NOT NULL,
  "attempts_started" integer DEFAULT 0 NOT NULL,
  "max_attempts" integer DEFAULT 3 NOT NULL,
  "run_at" timestamp with time zone DEFAULT now() NOT NULL,
  "locked_at" timestamp with time zone,
  "locked_by" text,
  "last_error" text,
  "payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "result_json" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "generation_jobs_ready_idx"
  ON "generation_jobs" ("status", "run_at", "priority");

CREATE INDEX IF NOT EXISTS "generation_jobs_notebook_idx"
  ON "generation_jobs" ("notebook_id", "created_at");

CREATE UNIQUE INDEX IF NOT EXISTS "generation_jobs_notebook_idempotency_active_unique"
  ON "generation_jobs" ("notebook_id", "idempotency_key");
