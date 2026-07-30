-- Appointment Governance Wave B: additive appointment model.
-- Position roles remain DIIS catalog values; no Keycloak position role is created.

-- 1. Enums
CREATE TYPE "school"."AppointmentStatus" AS ENUM (
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'ACTIVE',
  'SUSPENDED',
  'ENDED',
  'REJECTED',
  'CANCELLED',
  'SUPERSEDED'
);

CREATE TYPE "school"."AppointmentKind" AS ENUM (
  'DEFINITIVE',
  'PLT'
);

CREATE TYPE "school"."AppointmentSource" AS ENUM (
  'MANUAL',
  'STAFF_POSITION_MIGRATION'
);

CREATE TYPE "school"."AppointmentApprovalDecision" AS ENUM (
  'APPROVED',
  'REJECTED'
);

CREATE TYPE "school"."AppointmentMigrationStatus" AS ENUM (
  'MIGRATED',
  'QUARANTINED',
  'SKIPPED'
);

-- Keep the historical DB enum compatible with DIIS position catalog values.
-- These remain forbidden as Keycloak realm roles by application code.
ALTER TYPE "auth"."UserRole" ADD VALUE IF NOT EXISTS 'WAKIL_KOOR_BKK';
ALTER TYPE "auth"."UserRole" ADD VALUE IF NOT EXISTS 'WAKIL_KOOR_HUBIN';

-- 2. Explicit deputy position catalog rows.
INSERT INTO "school"."positions" ("code", "name", "category", "scope_type", "sort_order", "updated_at") VALUES
  ('WAKIL_KOOR_BKK',   'Wakil Koordinator BKK',   'FUNGSIONAL', 'NONE', 53, CURRENT_TIMESTAMP),
  ('WAKIL_KOOR_HUBIN', 'Wakil Koordinator Hubin', 'FUNGSIONAL', 'NONE', 54, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

UPDATE "school"."positions" c SET "parent_id" = p."id"
FROM "school"."positions" p
WHERE p."code" = 'KOOR_BKK' AND c."code" = 'WAKIL_KOOR_BKK' AND c."parent_id" IS NULL;

UPDATE "school"."positions" c SET "parent_id" = p."id"
FROM "school"."positions" p
WHERE p."code" = 'KOOR_HUBIN' AND c."code" = 'WAKIL_KOOR_HUBIN' AND c."parent_id" IS NULL;

INSERT INTO "school"."position_permissions" ("position_id", "permission_id")
SELECT pos."id", perm."id"
FROM (VALUES
  ('WAKIL_KOOR_BKK','ppdb.stats.read'),
  ('WAKIL_KOOR_BKK','announcement.read'),
  ('WAKIL_KOOR_HUBIN','ppdb.read'),
  ('WAKIL_KOOR_HUBIN','announcement.read')
) AS m(pos_code, perm_code)
JOIN "school"."positions" pos ON pos."code" = m.pos_code
JOIN "auth"."permissions" perm ON perm."code" = m.perm_code
ON CONFLICT DO NOTHING;

-- 3. Appointment tables.
CREATE TABLE "school"."appointments" (
  "id"                       UUID NOT NULL DEFAULT gen_random_uuid(),
  "staff_id"                 UUID NOT NULL,
  "position_id"              UUID NOT NULL,
  "academic_year_id"         UUID NOT NULL,
  "major_id"                 UUID,
  "kind"                     "school"."AppointmentKind" NOT NULL DEFAULT 'DEFINITIVE',
  "status"                   "school"."AppointmentStatus" NOT NULL DEFAULT 'DRAFT',
  "effective_from"           DATE NOT NULL,
  "effective_until"          DATE,
  "reason"                   TEXT,
  "requested_by_user_id"     UUID,
  "approved_at"              TIMESTAMP(3),
  "activated_at"             TIMESTAMP(3),
  "suspended_at"             TIMESTAMP(3),
  "suspension_until"         DATE,
  "suspension_reason"        TEXT,
  "ended_at"                 TIMESTAMP(3),
  "superseded_by_id"         UUID,
  "replaces_appointment_id"  UUID,
  "source"                   "school"."AppointmentSource" NOT NULL DEFAULT 'MANUAL',
  "source_staff_position_id" UUID,
  "created_at"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"               TIMESTAMP(3) NOT NULL,
  CONSTRAINT "appointments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "appointments_staff_fk" FOREIGN KEY ("staff_id") REFERENCES "school"."staff"("id"),
  CONSTRAINT "appointments_position_fk" FOREIGN KEY ("position_id") REFERENCES "school"."positions"("id"),
  CONSTRAINT "appointments_ay_fk" FOREIGN KEY ("academic_year_id") REFERENCES "school"."academic_years"("id"),
  CONSTRAINT "appointments_major_fk" FOREIGN KEY ("major_id") REFERENCES "school"."majors"("id"),
  CONSTRAINT "appointments_effective_range_check" CHECK ("effective_until" IS NULL OR "effective_until" >= "effective_from"),
  CONSTRAINT "appointments_plt_requires_end_reason_check" CHECK (
    "kind" <> 'PLT'
    OR ("effective_until" IS NOT NULL AND "reason" IS NOT NULL AND length(trim("reason")) > 0)
  ),
  CONSTRAINT "appointments_suspended_requires_reason_check" CHECK (
    "status" <> 'SUSPENDED'
    OR ("suspended_at" IS NOT NULL AND "suspension_reason" IS NOT NULL AND length(trim("suspension_reason")) > 0)
  ),
  CONSTRAINT "appointments_suspension_until_check" CHECK (
    "suspension_until" IS NULL OR "suspension_until" >= "effective_from"
  )
);

CREATE INDEX "appointments_staff_id_idx" ON "school"."appointments"("staff_id");
CREATE INDEX "appointments_pos_ay_idx" ON "school"."appointments"("position_id", "academic_year_id");
CREATE INDEX "appointments_ay_status_idx" ON "school"."appointments"("academic_year_id", "status");
CREATE INDEX "appointments_source_staff_position_id_idx" ON "school"."appointments"("source_staff_position_id");

CREATE UNIQUE INDEX "appointments_source_staff_position_unique"
ON "school"."appointments"("source_staff_position_id")
WHERE "source_staff_position_id" IS NOT NULL;

CREATE UNIQUE INDEX "appointment_unique_school_position_live"
ON "school"."appointments"("position_id", "academic_year_id")
WHERE "major_id" IS NULL
  AND "status" = 'ACTIVE';

CREATE UNIQUE INDEX "appointment_unique_major_position_live"
ON "school"."appointments"("position_id", "academic_year_id", "major_id")
WHERE "major_id" IS NOT NULL
  AND "status" = 'ACTIVE';

CREATE UNIQUE INDEX "appointment_unique_staff_position_scope_live"
ON "school"."appointments"(
  "staff_id",
  "position_id",
  "academic_year_id",
  COALESCE("major_id", '00000000-0000-0000-0000-000000000000'::uuid)
)
WHERE "status" = 'ACTIVE';

CREATE UNIQUE INDEX "appointment_unique_replaces_open"
ON "school"."appointments"("replaces_appointment_id")
WHERE "replaces_appointment_id" IS NOT NULL
  AND "status" IN ('PENDING_APPROVAL', 'APPROVED', 'ACTIVE');

CREATE UNIQUE INDEX "appointment_unique_school_position_open_candidate"
ON "school"."appointments"("position_id", "academic_year_id")
WHERE "major_id" IS NULL
  AND "replaces_appointment_id" IS NULL
  AND "status" IN ('PENDING_APPROVAL', 'APPROVED');

CREATE UNIQUE INDEX "appointment_unique_major_position_open_candidate"
ON "school"."appointments"("position_id", "academic_year_id", "major_id")
WHERE "major_id" IS NOT NULL
  AND "replaces_appointment_id" IS NULL
  AND "status" IN ('PENDING_APPROVAL', 'APPROVED');

CREATE TABLE "school"."appointment_approvals" (
  "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
  "appointment_id"   UUID NOT NULL,
  "approver_user_id" UUID NOT NULL,
  "decision"         "school"."AppointmentApprovalDecision" NOT NULL,
  "note"             TEXT,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "appointment_approvals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "appointment_approvals_appointment_fk" FOREIGN KEY ("appointment_id") REFERENCES "school"."appointments"("id") ON DELETE CASCADE
);

CREATE INDEX "appointment_approvals_appointment_id_idx" ON "school"."appointment_approvals"("appointment_id");
CREATE INDEX "appointment_approvals_approver_user_id_idx" ON "school"."appointment_approvals"("approver_user_id");

CREATE TABLE "school"."appointment_migration_reviews" (
  "id"                       UUID NOT NULL DEFAULT gen_random_uuid(),
  "source_staff_position_id" UUID,
  "user_id"                  UUID,
  "staff_id"                 UUID,
  "position_id"              UUID,
  "academic_year_id"         UUID,
  "major_id"                 UUID,
  "status"                   "school"."AppointmentMigrationStatus" NOT NULL,
  "reason"                   TEXT NOT NULL,
  "created_at"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewed_at"              TIMESTAMP(3),
  "reviewed_by_user_id"      UUID,
  CONSTRAINT "appointment_migration_reviews_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "appointment_migration_reviews_status_idx" ON "school"."appointment_migration_reviews"("status");
CREATE INDEX "appointment_migration_reviews_source_staff_position_id_idx" ON "school"."appointment_migration_reviews"("source_staff_position_id");

-- 4. Fail-closed bridge from legacy StaffPosition.
--
-- Only rows with an explicit stable identity role and valid scope are migrated.
-- Historical position-role identities, deleted users/staff, invalid dates, and
-- duplicate live scopes are quarantined for Director/Super Admin review.
CREATE TEMP TABLE "appointment_wave_b_classified" ON COMMIT DROP AS
WITH source_rows AS (
  SELECT
    sp."id" AS "source_staff_position_id",
    sp."staff_id",
    st."user_id",
    u."role"::text AS "user_role",
    u."is_active" AS "user_is_active",
    st."deleted_at" AS "staff_deleted_at",
    u."deleted_at" AS "user_deleted_at",
    sp."position_id",
    p."code" AS "position_code",
    p."scope_type"::text AS "position_scope_type",
    sp."academic_year_id",
    ay."is_active" AS "academic_year_is_active",
    ay."start_date" AS "academic_year_start_date",
    ay."end_date" AS "academic_year_end_date",
    sp."major_id",
    sp."is_active",
    COALESCE(sp."start_date", ay."start_date") AS "effective_from",
    sp."end_date" AS "effective_until",
    CASE
      WHEN st."deleted_at" IS NOT NULL OR u."deleted_at" IS NOT NULL THEN 'pegawai atau user sudah dihapus'
      WHEN u."is_active" = false THEN 'user tidak aktif'
      WHEN u."role"::text NOT IN ('TATA_USAHA','GURU') THEN 'candidate appointment harus pegawai aktif dengan role stabil GURU atau TATA_USAHA'
      WHEN p."scope_type"::text = 'MAJOR' AND sp."major_id" IS NULL THEN 'jabatan scope MAJOR tidak memiliki majorId'
      WHEN p."scope_type"::text <> 'MAJOR' AND sp."major_id" IS NOT NULL THEN 'jabatan scope NONE memiliki majorId'
      WHEN COALESCE(sp."start_date", ay."start_date") > ay."end_date" THEN 'tanggal mulai berada di luar tahun ajaran'
      WHEN sp."end_date" IS NOT NULL AND sp."end_date" < COALESCE(sp."start_date", ay."start_date") THEN 'tanggal akhir lebih awal dari tanggal mulai'
      WHEN sp."end_date" IS NOT NULL AND sp."end_date" > ay."end_date" THEN 'tanggal akhir melewati tahun ajaran'
      ELSE NULL
    END AS "base_quarantine_reason",
    CASE
      WHEN sp."is_active" = false OR (sp."end_date" IS NOT NULL AND sp."end_date" < CURRENT_DATE) THEN 'ENDED'
      WHEN ay."is_active" = true
        AND COALESCE(sp."start_date", ay."start_date") <= CURRENT_DATE
        AND (sp."end_date" IS NULL OR sp."end_date" >= CURRENT_DATE)
        THEN 'ACTIVE'
      ELSE 'APPROVED'
    END AS "appointment_status"
  FROM "school"."staff_positions" sp
  JOIN "school"."staff" st ON st."id" = sp."staff_id"
  JOIN "auth"."users" u ON u."id" = st."user_id"
  JOIN "school"."positions" p ON p."id" = sp."position_id"
  JOIN "school"."academic_years" ay ON ay."id" = sp."academic_year_id"
),
scoped_rows AS (
  SELECT
    sr.*,
    COUNT(*) FILTER (
      WHERE sr."base_quarantine_reason" IS NULL
        AND sr."appointment_status" <> 'ENDED'
    ) OVER (
      PARTITION BY
        sr."position_id",
        sr."academic_year_id",
        COALESCE(sr."major_id", '00000000-0000-0000-0000-000000000000'::uuid)
    ) AS "live_scope_count"
  FROM source_rows sr
)
SELECT
  scoped_rows.*,
  CASE
    WHEN scoped_rows."base_quarantine_reason" IS NOT NULL THEN scoped_rows."base_quarantine_reason"
    WHEN scoped_rows."appointment_status" <> 'ENDED' AND scoped_rows."live_scope_count" > 1 THEN 'duplikat live scope jabatan pada StaffPosition'
    ELSE NULL
  END AS "final_quarantine_reason"
FROM scoped_rows;

INSERT INTO "school"."appointments" (
  "staff_id",
  "position_id",
  "academic_year_id",
  "major_id",
  "kind",
  "status",
  "effective_from",
  "effective_until",
  "source",
  "source_staff_position_id",
  "created_at",
  "updated_at"
)
SELECT
  "staff_id",
  "position_id",
  "academic_year_id",
  "major_id",
  'DEFINITIVE'::"school"."AppointmentKind",
  "appointment_status"::"school"."AppointmentStatus",
  "effective_from",
  CASE
    WHEN "appointment_status" = 'ENDED' THEN COALESCE("effective_until", "academic_year_end_date")
    ELSE "effective_until"
  END,
  'STAFF_POSITION_MIGRATION'::"school"."AppointmentSource",
  "source_staff_position_id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "appointment_wave_b_classified"
WHERE "final_quarantine_reason" IS NULL;

INSERT INTO "school"."appointment_migration_reviews" (
  "source_staff_position_id",
  "user_id",
  "staff_id",
  "position_id",
  "academic_year_id",
  "major_id",
  "status",
  "reason"
)
SELECT
  c."source_staff_position_id",
  c."user_id",
  c."staff_id",
  c."position_id",
  c."academic_year_id",
  c."major_id",
  CASE
    WHEN c."final_quarantine_reason" IS NULL THEN 'MIGRATED'::"school"."AppointmentMigrationStatus"
    ELSE 'QUARANTINED'::"school"."AppointmentMigrationStatus"
  END,
  CASE
    WHEN c."final_quarantine_reason" IS NULL THEN 'StaffPosition dimigrasikan ke Appointment.'
    ELSE c."final_quarantine_reason"
  END
FROM "appointment_wave_b_classified" c;

INSERT INTO "school"."appointment_migration_reviews" (
  "user_id",
  "status",
  "reason"
)
SELECT
  u."id",
  'QUARANTINED'::"school"."AppointmentMigrationStatus",
  'auth.users.role masih position code; perlu stable-role mapping eksplisit sebelum appointment access'
FROM "auth"."users" u
WHERE u."deleted_at" IS NULL
  AND u."role"::text NOT IN ('SUPER_ADMIN','TATA_USAHA','GURU','SISWA','ORANG_TUA','INDUSTRI')
  AND NOT EXISTS (
    SELECT 1
    FROM "school"."appointment_migration_reviews" r
    WHERE r."user_id" = u."id"
      AND r."reason" = 'auth.users.role masih position code; perlu stable-role mapping eksplisit sebelum appointment access'
  );
