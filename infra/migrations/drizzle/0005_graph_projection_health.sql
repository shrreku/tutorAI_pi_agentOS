ALTER TABLE "neo4j_projection_state" ADD COLUMN IF NOT EXISTS "last_projected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "neo4j_projection_state" ADD COLUMN IF NOT EXISTS "last_failure_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "neo4j_projection_state" ADD COLUMN IF NOT EXISTS "failure_reason" text;--> statement-breakpoint
ALTER TABLE "neo4j_projection_state" ADD COLUMN IF NOT EXISTS "canonical_updated_at" timestamp with time zone;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "neo4j_source_projection_state" (
	"id" text PRIMARY KEY NOT NULL,
	"notebook_id" text NOT NULL,
	"source_id" text NOT NULL,
	"status" text DEFAULT 'idle' NOT NULL,
	"lag_seconds" integer,
	"last_projected_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	"failure_reason" text,
	"canonical_updated_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "neo4j_source_projection_state" ADD CONSTRAINT "neo4j_source_projection_state_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "neo4j_source_projection_state" ADD CONSTRAINT "neo4j_source_projection_state_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "neo4j_source_projection_state_notebook_source_unique" ON "neo4j_source_projection_state" USING btree ("notebook_id","source_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "neo4j_source_projection_state_notebook_idx" ON "neo4j_source_projection_state" USING btree ("notebook_id");
