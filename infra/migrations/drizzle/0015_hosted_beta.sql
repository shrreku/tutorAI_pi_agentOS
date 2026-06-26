ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "workos_user_id" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "disabled_at" timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS "users_workos_user_id_unique" ON "users" ("workos_user_id");

ALTER TABLE "notebooks" ADD COLUMN IF NOT EXISTS "workspace_type" text NOT NULL DEFAULT 'personal_learner';
ALTER TABLE "notebooks" ADD COLUMN IF NOT EXISTS "study_template_id" text;
ALTER TABLE "notebooks" ADD COLUMN IF NOT EXISTS "disabled_at" timestamptz;
CREATE INDEX IF NOT EXISTS "notebooks_study_template_idx" ON "notebooks" ("study_template_id");

CREATE TABLE IF NOT EXISTS "user_product_state" (
  "user_id" text PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "study_access" integer NOT NULL DEFAULT 1,
  "ingestion_access" integer NOT NULL DEFAULT 0,
  "admin_access" integer NOT NULL DEFAULT 0,
  "pilot_tags_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "onboarding_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "trial_budget_granted_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "beta_consents" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "consent_version" text NOT NULL,
  "accepted_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "beta_consents_user_idx" ON "beta_consents" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "beta_consents_user_version_unique" ON "beta_consents" ("user_id", "consent_version");

CREATE TABLE IF NOT EXISTS "credit_ledger_entries" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "credit_type" text NOT NULL,
  "entry_type" text NOT NULL,
  "amount_cents" integer NOT NULL,
  "reservation_id" text,
  "reference_type" text,
  "reference_id" text,
  "reason" text,
  "metadata_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "credit_ledger_user_idx" ON "credit_ledger_entries" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "credit_ledger_reservation_idx" ON "credit_ledger_entries" ("reservation_id");

CREATE TABLE IF NOT EXISTS "credit_reservations" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "credit_type" text NOT NULL,
  "reserved_cents" integer NOT NULL,
  "settled_cents" integer NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'active',
  "reference_type" text,
  "reference_id" text,
  "expires_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "credit_reservations_user_idx" ON "credit_reservations" ("user_id", "status");
CREATE INDEX IF NOT EXISTS "credit_reservations_reference_idx" ON "credit_reservations" ("reference_type", "reference_id");

CREATE TABLE IF NOT EXISTS "study_templates" (
  "id" text PRIMARY KEY NOT NULL,
  "slug" text NOT NULL,
  "title" text NOT NULL,
  "topic" text NOT NULL,
  "source_level" text NOT NULL,
  "estimated_minutes" integer NOT NULL,
  "study_mode" text NOT NULL,
  "expected_outcome" text NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "notebook_id" text NOT NULL REFERENCES "notebooks"("id") ON DELETE RESTRICT,
  "readiness_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "source_rights_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "study_templates_slug_unique" ON "study_templates" ("slug");
CREATE INDEX IF NOT EXISTS "study_templates_status_idx" ON "study_templates" ("status", "sort_order");

CREATE TABLE IF NOT EXISTS "access_codes" (
  "id" text PRIMARY KEY NOT NULL,
  "code" text NOT NULL,
  "code_type" text NOT NULL DEFAULT 'single_use',
  "grants_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "max_redemptions" integer,
  "redemption_count" integer NOT NULL DEFAULT 0,
  "expires_at" timestamptz,
  "revoked_at" timestamptz,
  "created_by_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "access_codes_code_unique" ON "access_codes" ("code");

CREATE TABLE IF NOT EXISTS "access_code_redemptions" (
  "id" text PRIMARY KEY NOT NULL,
  "access_code_id" text NOT NULL REFERENCES "access_codes"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "redeemed_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "access_code_redemptions_code_idx" ON "access_code_redemptions" ("access_code_id");
CREATE UNIQUE INDEX IF NOT EXISTS "access_code_redemptions_code_user_unique" ON "access_code_redemptions" ("access_code_id", "user_id");

CREATE TABLE IF NOT EXISTS "product_analytics_events" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "event_name" text NOT NULL,
  "properties_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "product_analytics_events_name_idx" ON "product_analytics_events" ("event_name", "created_at");
CREATE INDEX IF NOT EXISTS "product_analytics_events_user_idx" ON "product_analytics_events" ("user_id", "created_at");

CREATE TABLE IF NOT EXISTS "learning_feedback" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "notebook_id" text REFERENCES "notebooks"("id") ON DELETE SET NULL,
  "study_goal" text NOT NULL,
  "helped" integer NOT NULL,
  "confusion_text" text,
  "alternative_workflow" text,
  "contact_permission" integer NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'submitted',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "learning_feedback_user_idx" ON "learning_feedback" ("user_id", "created_at");

CREATE TABLE IF NOT EXISTS "support_reports" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "category" text NOT NULL,
  "message" text NOT NULL,
  "context_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'submitted',
  "reviewed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "support_reports_status_idx" ON "support_reports" ("status", "created_at");

CREATE TABLE IF NOT EXISTS "account_deletion_requests" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'requested',
  "notes" text,
  "requested_at" timestamptz NOT NULL DEFAULT now(),
  "completed_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "account_deletion_requests_status_idx" ON "account_deletion_requests" ("status");

CREATE TABLE IF NOT EXISTS "ingestion_trigger_runs" (
  "id" text PRIMARY KEY NOT NULL,
  "triggered_by" text NOT NULL,
  "triggered_by_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'started',
  "jobs_claimed" integer NOT NULL DEFAULT 0,
  "jobs_completed" integer NOT NULL DEFAULT 0,
  "jobs_failed" integer NOT NULL DEFAULT 0,
  "error" text,
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "completed_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "ingestion_trigger_runs_started_idx" ON "ingestion_trigger_runs" ("started_at");
