-- ─── Sprint 4 / SMA-46a: KB audit fields ─────────────────────────────────────
-- Additive: tambah kolom nullable ke rag_chunks untuk audit + publish workflow.
-- Tidak ada kolom DROP/ALTER — aman dijalankan di produksi yang sudah punya data.
--
-- createdBy   = auth.users.id yang membuat chunk (no FK, audit policy)
-- publishedBy = auth.users.id yang publish (no FK, audit policy)
-- publishedAt = timestamp publish
-- is_active default berubah false (draft): hanya ada di schema, tidak di kolom ALTER
--             karena kolom sudah ada — default baru hanya berlaku untuk INSERT baru.

ALTER TABLE "ai_knowledge"."rag_chunks"
  ADD COLUMN IF NOT EXISTS "created_by"   UUID,
  ADD COLUMN IF NOT EXISTS "published_by" UUID,
  ADD COLUMN IF NOT EXISTS "published_at" TIMESTAMPTZ;
