-- 2P: Modul Ajar terstruktur (Kurikulum Merdeka) — kolom body JSONB di rpp.
-- ADDITIVE & IDEMPOTEN (prod-safe). Menyimpan CP/TP/ATP/profil/sarana/kegiatan/asesmen/dst.
ALTER TABLE "academic"."rpp" ADD COLUMN IF NOT EXISTS "body" JSONB;
