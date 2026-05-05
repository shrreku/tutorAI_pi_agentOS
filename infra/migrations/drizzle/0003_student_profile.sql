CREATE TABLE IF NOT EXISTS "student_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"notebook_id" text NOT NULL,
	"user_id" text NOT NULL,
	"goal_summary" text,
	"background_summary" text,
	"pace_preference" text,
	"depth_preference" text,
	"example_preferences_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"assessment_preference_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"constraints_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "student_profiles_notebook_user_unique" ON "student_profiles" ("notebook_id", "user_id");
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'student_profiles_notebook_id_notebooks_id_fk'
  ) THEN
    ALTER TABLE "student_profiles"
      ADD CONSTRAINT "student_profiles_notebook_id_notebooks_id_fk"
      FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'student_profiles_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "student_profiles"
      ADD CONSTRAINT "student_profiles_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;