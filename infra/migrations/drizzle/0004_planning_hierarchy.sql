ALTER TABLE "curricula" ADD COLUMN IF NOT EXISTS "active_module_id" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "curriculum_modules" (
	"id" text PRIMARY KEY NOT NULL,
	"notebook_id" text NOT NULL,
	"curriculum_id" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"order_index" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"source_refs_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"target_concept_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"prerequisite_module_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"estimated_session_count" integer DEFAULT 1 NOT NULL,
	"coverage_requirements_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"mastery_gate_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "objective_lists" (
	"id" text PRIMARY KEY NOT NULL,
	"notebook_id" text NOT NULL,
	"curriculum_id" text NOT NULL,
	"module_id" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"current_objective_id" text,
	"objective_ids_ordered" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"coverage_snapshot_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_run_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"notebook_id" text NOT NULL,
	"curriculum_id" text NOT NULL,
	"module_id" text NOT NULL,
	"objective_list_id" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"session_goal" text,
	"planned_objective_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"opener_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"diagnostic_question_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"teaching_arc_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"artifact_refs_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"exit_criteria_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recommendation_reason_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_run_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "coverage_items" (
	"id" text PRIMARY KEY NOT NULL,
	"notebook_id" text NOT NULL,
	"source_id" text,
	"source_version_id" text,
	"item_family" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"concept_id" text,
	"claim_id" text,
	"source_refs_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "coverage_records" (
	"id" text PRIMARY KEY NOT NULL,
	"notebook_id" text NOT NULL,
	"coverage_item_id" text NOT NULL,
	"curriculum_id" text,
	"module_id" text,
	"objective_list_id" text,
	"session_plan_id" text,
	"status" text DEFAULT 'planned' NOT NULL,
	"evidence_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_by_run_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "curriculum_modules_curriculum_order_idx" ON "curriculum_modules" ("curriculum_id", "order_index");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "objective_lists_module_idx" ON "objective_lists" ("module_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_plans_notebook_idx" ON "session_plans" ("notebook_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_plans_module_idx" ON "session_plans" ("module_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coverage_items_notebook_family_idx" ON "coverage_items" ("notebook_id", "item_family");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coverage_records_notebook_status_idx" ON "coverage_records" ("notebook_id", "status");
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'curricula_active_module_id_curriculum_modules_id_fk') THEN
    ALTER TABLE "curricula"
      ADD CONSTRAINT "curricula_active_module_id_curriculum_modules_id_fk"
      FOREIGN KEY ("active_module_id") REFERENCES "public"."curriculum_modules"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'curriculum_modules_notebook_id_notebooks_id_fk') THEN
    ALTER TABLE "curriculum_modules"
      ADD CONSTRAINT "curriculum_modules_notebook_id_notebooks_id_fk"
      FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'curriculum_modules_curriculum_id_curricula_id_fk') THEN
    ALTER TABLE "curriculum_modules"
      ADD CONSTRAINT "curriculum_modules_curriculum_id_curricula_id_fk"
      FOREIGN KEY ("curriculum_id") REFERENCES "public"."curricula"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'objective_lists_notebook_id_notebooks_id_fk') THEN
    ALTER TABLE "objective_lists"
      ADD CONSTRAINT "objective_lists_notebook_id_notebooks_id_fk"
      FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'objective_lists_curriculum_id_curricula_id_fk') THEN
    ALTER TABLE "objective_lists"
      ADD CONSTRAINT "objective_lists_curriculum_id_curricula_id_fk"
      FOREIGN KEY ("curriculum_id") REFERENCES "public"."curricula"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'objective_lists_module_id_curriculum_modules_id_fk') THEN
    ALTER TABLE "objective_lists"
      ADD CONSTRAINT "objective_lists_module_id_curriculum_modules_id_fk"
      FOREIGN KEY ("module_id") REFERENCES "public"."curriculum_modules"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_plans_notebook_id_notebooks_id_fk') THEN
    ALTER TABLE "session_plans"
      ADD CONSTRAINT "session_plans_notebook_id_notebooks_id_fk"
      FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_plans_curriculum_id_curricula_id_fk') THEN
    ALTER TABLE "session_plans"
      ADD CONSTRAINT "session_plans_curriculum_id_curricula_id_fk"
      FOREIGN KEY ("curriculum_id") REFERENCES "public"."curricula"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_plans_module_id_curriculum_modules_id_fk') THEN
    ALTER TABLE "session_plans"
      ADD CONSTRAINT "session_plans_module_id_curriculum_modules_id_fk"
      FOREIGN KEY ("module_id") REFERENCES "public"."curriculum_modules"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_plans_objective_list_id_objective_lists_id_fk') THEN
    ALTER TABLE "session_plans"
      ADD CONSTRAINT "session_plans_objective_list_id_objective_lists_id_fk"
      FOREIGN KEY ("objective_list_id") REFERENCES "public"."objective_lists"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'coverage_items_notebook_id_notebooks_id_fk') THEN
    ALTER TABLE "coverage_items"
      ADD CONSTRAINT "coverage_items_notebook_id_notebooks_id_fk"
      FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'coverage_items_source_id_sources_id_fk') THEN
    ALTER TABLE "coverage_items"
      ADD CONSTRAINT "coverage_items_source_id_sources_id_fk"
      FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'coverage_items_source_version_id_source_versions_id_fk') THEN
    ALTER TABLE "coverage_items"
      ADD CONSTRAINT "coverage_items_source_version_id_source_versions_id_fk"
      FOREIGN KEY ("source_version_id") REFERENCES "public"."source_versions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'coverage_items_concept_id_concepts_id_fk') THEN
    ALTER TABLE "coverage_items"
      ADD CONSTRAINT "coverage_items_concept_id_concepts_id_fk"
      FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'coverage_items_claim_id_claims_id_fk') THEN
    ALTER TABLE "coverage_items"
      ADD CONSTRAINT "coverage_items_claim_id_claims_id_fk"
      FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'coverage_records_notebook_id_notebooks_id_fk') THEN
    ALTER TABLE "coverage_records"
      ADD CONSTRAINT "coverage_records_notebook_id_notebooks_id_fk"
      FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'coverage_records_coverage_item_id_coverage_items_id_fk') THEN
    ALTER TABLE "coverage_records"
      ADD CONSTRAINT "coverage_records_coverage_item_id_coverage_items_id_fk"
      FOREIGN KEY ("coverage_item_id") REFERENCES "public"."coverage_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'coverage_records_curriculum_id_curricula_id_fk') THEN
    ALTER TABLE "coverage_records"
      ADD CONSTRAINT "coverage_records_curriculum_id_curricula_id_fk"
      FOREIGN KEY ("curriculum_id") REFERENCES "public"."curricula"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'coverage_records_module_id_curriculum_modules_id_fk') THEN
    ALTER TABLE "coverage_records"
      ADD CONSTRAINT "coverage_records_module_id_curriculum_modules_id_fk"
      FOREIGN KEY ("module_id") REFERENCES "public"."curriculum_modules"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'coverage_records_objective_list_id_objective_lists_id_fk') THEN
    ALTER TABLE "coverage_records"
      ADD CONSTRAINT "coverage_records_objective_list_id_objective_lists_id_fk"
      FOREIGN KEY ("objective_list_id") REFERENCES "public"."objective_lists"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'coverage_records_session_plan_id_session_plans_id_fk') THEN
    ALTER TABLE "coverage_records"
      ADD CONSTRAINT "coverage_records_session_plan_id_session_plans_id_fk"
      FOREIGN KEY ("session_plan_id") REFERENCES "public"."session_plans"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;