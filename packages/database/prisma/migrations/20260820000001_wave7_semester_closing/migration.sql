-- Wave 7 Phase 6: Semester closing, active-period invariants, and final academic audit permissions.
-- Additive and consolidated per approved Wave 7 schema contract.

CREATE TABLE IF NOT EXISTS "school"."semester_closures" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "academic_year_id" UUID NOT NULL,
  "semester_id" UUID NOT NULL,
  "next_semester_id" UUID,
  "closed_by_user_id" UUID NOT NULL,
  "closed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readiness_version" VARCHAR(40) NOT NULL,
  "readiness_hash" VARCHAR(96) NOT NULL,
  "idempotency_key" VARCHAR(180) NOT NULL,
  "snapshot" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "semester_closures_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "semester_closures_academic_year_id_fkey"
    FOREIGN KEY ("academic_year_id") REFERENCES "school"."academic_years"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "semester_closures_semester_id_fkey"
    FOREIGN KEY ("semester_id") REFERENCES "school"."semesters"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "semester_closures_next_semester_id_fkey"
    FOREIGN KEY ("next_semester_id") REFERENCES "school"."semesters"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "semester_closures_closed_by_user_id_fkey"
    FOREIGN KEY ("closed_by_user_id") REFERENCES "auth"."users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "semester_closures_not_self_next_check"
    CHECK ("next_semester_id" IS NULL OR "next_semester_id" <> "semester_id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "semester_closures_semester_id_key"
  ON "school"."semester_closures"("semester_id");

CREATE UNIQUE INDEX IF NOT EXISTS "semester_closures_idempotency_key_key"
  ON "school"."semester_closures"("idempotency_key");

CREATE UNIQUE INDEX IF NOT EXISTS "semester_closures_next_semester_id_key"
  ON "school"."semester_closures"("next_semester_id");

CREATE INDEX IF NOT EXISTS "semester_closures_academic_year_id_closed_at_idx"
  ON "school"."semester_closures"("academic_year_id", "closed_at");

CREATE INDEX IF NOT EXISTS "semester_closures_closed_by_user_id_closed_at_idx"
  ON "school"."semester_closures"("closed_by_user_id", "closed_at");

CREATE INDEX IF NOT EXISTS "semester_closures_readiness_hash_idx"
  ON "school"."semester_closures"("readiness_hash");

CREATE UNIQUE INDEX IF NOT EXISTS "academic_years_single_active_idx"
  ON "school"."academic_years"("is_active")
  WHERE "is_active" IS TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS "semesters_single_active_idx"
  ON "school"."semesters"("is_active")
  WHERE "is_active" IS TRUE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'academic_years_date_order_check'
      AND conrelid = '"school"."academic_years"'::regclass
  ) THEN
    ALTER TABLE "school"."academic_years"
      ADD CONSTRAINT "academic_years_date_order_check" CHECK ("end_date" > "start_date");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'semesters_number_check'
      AND conrelid = '"school"."semesters"'::regclass
  ) THEN
    ALTER TABLE "school"."semesters"
      ADD CONSTRAINT "semesters_number_check" CHECK ("number" IN (1, 2));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'semesters_date_order_check'
      AND conrelid = '"school"."semesters"'::regclass
  ) THEN
    ALTER TABLE "school"."semesters"
      ADD CONSTRAINT "semesters_date_order_check" CHECK ("end_date" > "start_date");
  END IF;
END $$;

INSERT INTO "auth"."permissions" ("code", "description", "module")
VALUES
  ('academic.period.read', 'Melihat konfigurasi periode akademik', 'academic'),
  ('academic.period.manage', 'Menyiapkan tahun ajaran dan semester akademik', 'academic'),
  ('academic.semester.close', 'Menutup semester akademik secara final', 'academic'),
  ('academic.final-report.read', 'Melihat laporan akademik final dan snapshot penutupan', 'academic')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "auth"."role_permissions" ("role", "permission_id")
SELECT 'SUPER_ADMIN'::"auth"."UserRole", p."id"
FROM "auth"."permissions" p
WHERE p."code" IN ('academic.period.read', 'academic.period.manage', 'academic.final-report.read')
ON CONFLICT DO NOTHING;

INSERT INTO "school"."position_permissions" ("position_id", "permission_id")
SELECT pos."id", perm."id"
FROM (
  VALUES
    ('KEPALA_SEKOLAH', 'academic.period.read'),
    ('KEPALA_SEKOLAH', 'academic.semester.close'),
    ('KEPALA_SEKOLAH', 'academic.final-report.read'),
    ('WAKA_KURIKULUM', 'academic.period.read'),
    ('WAKA_KURIKULUM', 'academic.final-report.read'),
    ('KAPROG', 'academic.period.read'),
    ('KAPROG', 'academic.final-report.read')
) AS requested("position_code", "permission_code")
JOIN "school"."positions" pos ON pos."code"::text = requested."position_code"
JOIN "auth"."permissions" perm ON perm."code" = requested."permission_code"
ON CONFLICT DO NOTHING;
