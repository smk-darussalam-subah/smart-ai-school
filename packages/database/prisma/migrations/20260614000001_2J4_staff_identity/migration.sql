-- 2J-4: Identitas kepegawaian (school.staff) + field personal user + migrasi NIP→NIY
-- Urutan AMAN: additive (enum/kolom/tabel) -> backfill -> drop teacher.nip.
-- Atomik dalam satu migration (Postgres: DDL+DML satu transaksi).

-- ── 1. Enum baru ─────────────────────────────────────────────────────────────
CREATE TYPE "auth"."Gender" AS ENUM (
  'L',
  'P'
);

CREATE TYPE "school"."EmploymentStatus" AS ENUM (
  'GTY',
  'GTT',
  'PTY',
  'PTT'
);

-- ── 2. Field personal di auth.users (additive, nullable) ─────────────────────
ALTER TABLE "auth"."users"
  ADD COLUMN IF NOT EXISTS "gender"     "auth"."Gender",
  ADD COLUMN IF NOT EXISTS "birth_date" DATE,
  ADD COLUMN IF NOT EXISTS "address"    TEXT;

-- ── 3. Tabel school.staff (1:1 dgn auth.users) ───────────────────────────────
CREATE TABLE "school"."staff" (
  "id"                UUID        NOT NULL DEFAULT gen_random_uuid(),
  "user_id"           UUID        NOT NULL,
  "niy"               VARCHAR(50),
  "employment_status" "school"."EmploymentStatus" NOT NULL,
  "joined_at"         DATE,
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"        TIMESTAMP(3) NOT NULL,
  "deleted_at"        TIMESTAMP(3),

  CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "staff_user_id_key" ON "school"."staff"("user_id");
CREATE UNIQUE INDEX "staff_niy_key"     ON "school"."staff"("niy");
CREATE INDEX        "staff_deleted_at"  ON "school"."staff"("deleted_at");

-- ── 4. Backfill: buat baris staff utk tiap pegawai (KS/Guru/TU) ──────────────
-- niy diambil dari teacher.nip bila ada; status default per-role (data lama = dummy seed).
INSERT INTO "school"."staff" ("user_id", "niy", "employment_status", "joined_at", "updated_at")
SELECT
  u."id",
  t."nip",
  CASE WHEN u."role" = 'TATA_USAHA' THEN 'PTY'::"school"."EmploymentStatus"
       ELSE 'GTY'::"school"."EmploymentStatus" END,
  u."created_at"::date,
  CURRENT_TIMESTAMP
FROM "auth"."users" u
LEFT JOIN "teacher"."teachers" t ON t."user_id" = u."id"
WHERE u."role" IN ('GURU', 'TATA_USAHA', 'KEPALA_SEKOLAH')
  AND u."deleted_at" IS NULL
ON CONFLICT ("user_id") DO NOTHING;

-- ── 5. Drop kolom teacher.nip (identitas sudah pindah ke staff.niy) ──────────
ALTER TABLE "teacher"."teachers" DROP COLUMN IF EXISTS "nip";
