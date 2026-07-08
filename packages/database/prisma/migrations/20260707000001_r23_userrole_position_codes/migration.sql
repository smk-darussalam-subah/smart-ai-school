-- =============================================================================
-- R-23: Extend UserRole enum with 12 position codes
--
-- Position codes dari Struktur Organisasi (2J-5) perlu ada di UserRole enum
-- agar Prisma type system kompatibel dengan @smk/auth UserRole yang diperluas.
-- KEPALA_SEKOLAH sudah ada — hanya 12 position code baru yang ditambahkan.
--
-- Catatan: ALTER TYPE ... ADD VALUE tidak bisa dijalankan di dalam transaction
-- di PostgreSQL < 12. Prisma mendeteksi ini dan menjalankan tanpa transaction.
-- =============================================================================

ALTER TYPE "auth"."UserRole" ADD VALUE IF NOT EXISTS 'WAKA_KURIKULUM';
ALTER TYPE "auth"."UserRole" ADD VALUE IF NOT EXISTS 'WAKA_KESISWAAN';
ALTER TYPE "auth"."UserRole" ADD VALUE IF NOT EXISTS 'WAKA_HUMAS';
ALTER TYPE "auth"."UserRole" ADD VALUE IF NOT EXISTS 'WAKA_SARPRAS';
ALTER TYPE "auth"."UserRole" ADD VALUE IF NOT EXISTS 'KEPALA_TU';
ALTER TYPE "auth"."UserRole" ADD VALUE IF NOT EXISTS 'KAPROG';
ALTER TYPE "auth"."UserRole" ADD VALUE IF NOT EXISTS 'KOOR_BKK';
ALTER TYPE "auth"."UserRole" ADD VALUE IF NOT EXISTS 'KOOR_HUBIN';
ALTER TYPE "auth"."UserRole" ADD VALUE IF NOT EXISTS 'GURU_BK';
ALTER TYPE "auth"."UserRole" ADD VALUE IF NOT EXISTS 'BENDAHARA';
ALTER TYPE "auth"."UserRole" ADD VALUE IF NOT EXISTS 'STAF_KEPEGAWAIAN';
ALTER TYPE "auth"."UserRole" ADD VALUE IF NOT EXISTS 'OPERATOR_DAPODIK';
