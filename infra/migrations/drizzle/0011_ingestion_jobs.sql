CREATE TABLE IF NOT EXISTS "ingestion_jobs" (
  "id" text PRIMARY KEY NOT NULL,
  "job_name" text NOT NULL,
  "notebook_id" text NOT NULL REFERENCES "notebooks"("id") ON DELETE cascade,
  "source_id" text NOT NULL REFERENCES "sources"("id") ON DELETE cascade,
  "source_version_id" text NOT NULL REFERENCES "source_versions"("id") ON DELETE cascade,
  "status" text DEFAULT 'queued' NOT NULL,
  "priority" integer DEFAULT 0 NOT NULL,
  "attempts_started" integer DEFAULT 0 NOT NULL,
  "max_attempts" integer DEFAULT 3 NOT NULL,
  "run_at" timestamp with time zone DEFAULT now() NOT NULL,
  "locked_at" timestamp with time zone,
  "locked_by" text,
  "last_error" text,
  "payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "ingestion_jobs_ready_idx"
  ON "ingestion_jobs" ("status", "run_at", "priority");

CREATE INDEX IF NOT EXISTS "ingestion_jobs_notebook_idx"
  ON "ingestion_jobs" ("notebook_id", "created_at");

CREATE INDEX IF NOT EXISTS "ingestion_jobs_source_version_idx"
  ON "ingestion_jobs" ("source_version_id");
