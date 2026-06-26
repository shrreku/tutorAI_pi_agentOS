-- Stripe checkout idempotency: prevent duplicate grant ledger rows for the same session.
CREATE UNIQUE INDEX IF NOT EXISTS "credit_ledger_stripe_idempotency_unique"
  ON "credit_ledger_entries" ((metadata_json->>'idempotencyKey'))
  WHERE entry_type = 'grant' AND (metadata_json->>'idempotencyKey') IS NOT NULL;
