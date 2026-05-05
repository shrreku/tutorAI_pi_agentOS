CREATE INDEX IF NOT EXISTS "chunks_text_fts_idx" ON "chunks" USING gin (to_tsvector('english', "text"));
