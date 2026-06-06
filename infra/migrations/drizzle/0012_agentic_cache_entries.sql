CREATE TABLE IF NOT EXISTS "agentic_cache_entries" (
  "cache_key" text PRIMARY KEY NOT NULL,
  "namespace" text NOT NULL,
  "scope_type" text NOT NULL,
  "scope_id" text NOT NULL,
  "version" text NOT NULL,
  "value_json" jsonb NOT NULL,
  "expires_at" timestamp with time zone,
  "hit_count" integer DEFAULT 0 NOT NULL,
  "last_hit_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "agentic_cache_scope_idx"
  ON "agentic_cache_entries" ("namespace", "scope_type", "scope_id", "version");

CREATE INDEX IF NOT EXISTS "agentic_cache_expires_idx"
  ON "agentic_cache_entries" ("expires_at");
