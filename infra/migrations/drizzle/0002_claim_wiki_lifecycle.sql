ALTER TABLE "claims" ADD COLUMN IF NOT EXISTS "superseded_by_claim_id" text;
ALTER TABLE "claims" ADD COLUMN IF NOT EXISTS "reinforcement_count" integer DEFAULT 0 NOT NULL;
ALTER TABLE "claims" ADD COLUMN IF NOT EXISTS "retrieval_weight" real DEFAULT 1 NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'claims_superseded_by_claim_id_claims_id_fk'
  ) THEN
    ALTER TABLE "claims"
      ADD CONSTRAINT "claims_superseded_by_claim_id_claims_id_fk"
      FOREIGN KEY ("superseded_by_claim_id") REFERENCES "public"."claims"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "claims_notebook_superseded_idx" ON "claims" ("notebook_id", "superseded_by_claim_id");
