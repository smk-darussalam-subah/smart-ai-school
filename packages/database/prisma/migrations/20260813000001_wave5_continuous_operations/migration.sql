-- Wave 5 Phase 4 Continuous Operations
-- Additive consolidated migration: remedial participants, due-safe announcements,
-- NotificationLog composite refId support, and permission corrections.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'AssessmentSessionPurpose'
      AND n.nspname = 'academic'
  ) THEN
    CREATE TYPE "academic"."AssessmentSessionPurpose" AS ENUM ('regular', 'remedial');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'RemedialParticipantStatus'
      AND n.nspname = 'academic'
  ) THEN
    CREATE TYPE "academic"."RemedialParticipantStatus" AS ENUM (
      'assigned',
      'in_progress',
      'submitted',
      'passed',
      'needs_retry',
      'cancelled'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'KktpProvenance'
      AND n.nspname = 'academic'
  ) THEN
    CREATE TYPE "academic"."KktpProvenance" AS ENUM ('module', 'config', 'system_default');
  END IF;
END $$;

ALTER TYPE "academic"."AssessmentSessionStatus" ADD VALUE IF NOT EXISTS 'cancelled';

DROP INDEX IF EXISTS "notification"."notification_logs_ref_active_unique";
DROP INDEX IF EXISTS "notification"."notification_logs_idempotency_idx";
DROP INDEX IF EXISTS "notification"."notification_logs_ref_type_ref_id_idx";
DROP INDEX IF EXISTS "notification"."notification_logs_ref_type_ref_id_recipient_channel_status_idx";

ALTER TABLE "notification"."notification_logs"
  ALTER COLUMN "ref_id" TYPE VARCHAR(180)
  USING CASE WHEN "ref_id" IS NULL THEN NULL ELSE "ref_id"::TEXT END;

CREATE INDEX IF NOT EXISTS "notification_logs_ref_type_ref_id_recipient_channel_status_idx"
  ON "notification"."notification_logs"("ref_type", "ref_id", "recipient", "channel", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "notification_logs_ref_active_unique"
  ON "notification"."notification_logs"("ref_type", "ref_id", "recipient", "channel")
  WHERE "ref_type" IS NOT NULL
    AND "ref_id" IS NOT NULL
    AND "status" IN ('pending', 'sent');

ALTER TABLE "notification"."announcements"
  ADD COLUMN IF NOT EXISTS "delivery_prepared_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "announcements_due_scan_idx"
  ON "notification"."announcements"("status", "scheduled_at", "delivery_prepared_at");

ALTER TABLE "academic"."assessment_sessions"
  ADD COLUMN IF NOT EXISTS "purpose" "academic"."AssessmentSessionPurpose" NOT NULL DEFAULT 'regular',
  ADD COLUMN IF NOT EXISTS "teaching_assignment_id" UUID,
  ADD COLUMN IF NOT EXISTS "due_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "instructions" TEXT,
  ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelled_by" UUID,
  ADD COLUMN IF NOT EXISTS "cancel_reason" TEXT,
  ALTER COLUMN "module_id" DROP NOT NULL;

WITH matched AS (
  SELECT
    s."id" AS session_id,
    ta."id" AS teaching_assignment_id,
    COUNT(*) OVER (PARTITION BY s."id") AS match_count
  FROM "academic"."assessment_sessions" s
  JOIN "academic"."lms_modules" lm
    ON lm."id" = s."module_id"
  JOIN "academic"."teaching_assignments" ta
    ON ta."teacher_id" = s."teacher_id"
   AND ta."class_id" = COALESCE(s."class_id", lm."class_id")
   AND lower(ta."subject") = lower(lm."subject")
   AND ta."academic_year" = s."academic_year"
  WHERE s."purpose" = 'regular'
    AND s."teaching_assignment_id" IS NULL
    AND s."module_id" IS NOT NULL
    AND COALESCE(s."class_id", lm."class_id") IS NOT NULL
),
exact AS (
  SELECT session_id, teaching_assignment_id
  FROM matched
  WHERE match_count = 1
)
UPDATE "academic"."assessment_sessions" s
SET "teaching_assignment_id" = exact.teaching_assignment_id
FROM exact
WHERE s."id" = exact.session_id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'assessment_sessions_teaching_assignment_id_fkey'
      AND connamespace = 'academic'::regnamespace
  ) THEN
    ALTER TABLE "academic"."assessment_sessions"
      ADD CONSTRAINT "assessment_sessions_teaching_assignment_id_fkey"
      FOREIGN KEY ("teaching_assignment_id")
      REFERENCES "academic"."teaching_assignments"("id")
      ON DELETE RESTRICT
      ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'assessment_sessions_purpose_context_ck'
      AND connamespace = 'academic'::regnamespace
  ) THEN
    ALTER TABLE "academic"."assessment_sessions"
      ADD CONSTRAINT "assessment_sessions_purpose_context_ck"
      CHECK (
        ("purpose" = 'regular' AND "module_id" IS NOT NULL)
        OR ("purpose" = 'remedial' AND "teaching_assignment_id" IS NOT NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "assessment_sessions_teaching_assignment_purpose_status_idx"
  ON "academic"."assessment_sessions"("teaching_assignment_id", "purpose", "status");

CREATE INDEX IF NOT EXISTS "assessment_sessions_purpose_status_due_at_idx"
  ON "academic"."assessment_sessions"("purpose", "status", "due_at");

CREATE TABLE IF NOT EXISTS "academic"."remedial_participants" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "session_id" UUID NOT NULL,
  "student_id" UUID NOT NULL,
  "source_grade_id" UUID NOT NULL,
  "retry_of_participant_id" UUID,
  "retry_root_participant_id" UUID,
  "status" "academic"."RemedialParticipantStatus" NOT NULL DEFAULT 'assigned',
  "source_score" DECIMAL(5,2) NOT NULL,
  "source_grade_updated_at" TIMESTAMP(3) NOT NULL,
  "raw_score" DECIMAL(5,2),
  "effective_score" DECIMAL(5,2),
  "kktp_value" INTEGER NOT NULL,
  "kktp_provenance" "academic"."KktpProvenance" NOT NULL,
  "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "started_at" TIMESTAMP(3),
  "submitted_at" TIMESTAMP(3),
  "finalized_at" TIMESTAMP(3),
  "finalized_by" UUID,
  "cancelled_at" TIMESTAMP(3),
  "cancelled_by" UUID,
  "cancel_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "remedial_participants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "remedial_participants_kktp_value_ck" CHECK ("kktp_value" BETWEEN 0 AND 100),
  CONSTRAINT "remedial_participants_source_score_ck" CHECK ("source_score" BETWEEN 0 AND 100),
  CONSTRAINT "remedial_participants_raw_score_ck" CHECK ("raw_score" IS NULL OR "raw_score" BETWEEN 0 AND 100),
  CONSTRAINT "remedial_participants_effective_score_ck" CHECK ("effective_score" IS NULL OR "effective_score" BETWEEN 0 AND 100)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'remedial_participants_session_id_fkey'
      AND connamespace = 'academic'::regnamespace
  ) THEN
    ALTER TABLE "academic"."remedial_participants"
      ADD CONSTRAINT "remedial_participants_session_id_fkey"
      FOREIGN KEY ("session_id")
      REFERENCES "academic"."assessment_sessions"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'remedial_participants_student_id_fkey'
      AND connamespace = 'academic'::regnamespace
  ) THEN
    ALTER TABLE "academic"."remedial_participants"
      ADD CONSTRAINT "remedial_participants_student_id_fkey"
      FOREIGN KEY ("student_id")
      REFERENCES "student"."students"("id")
      ON DELETE RESTRICT
      ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'remedial_participants_source_grade_id_fkey'
      AND connamespace = 'academic'::regnamespace
  ) THEN
    ALTER TABLE "academic"."remedial_participants"
      ADD CONSTRAINT "remedial_participants_source_grade_id_fkey"
      FOREIGN KEY ("source_grade_id")
      REFERENCES "academic"."grades"("id")
      ON DELETE RESTRICT
      ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'remedial_participants_retry_of_participant_id_fkey'
      AND connamespace = 'academic'::regnamespace
  ) THEN
    ALTER TABLE "academic"."remedial_participants"
      ADD CONSTRAINT "remedial_participants_retry_of_participant_id_fkey"
      FOREIGN KEY ("retry_of_participant_id")
      REFERENCES "academic"."remedial_participants"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "remedial_participants_session_student_key"
  ON "academic"."remedial_participants"("session_id", "student_id");

CREATE UNIQUE INDEX IF NOT EXISTS "remedial_participants_retry_of_participant_id_key"
  ON "academic"."remedial_participants"("retry_of_participant_id")
  WHERE "retry_of_participant_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "remedial_participants_source_grade_open_unique"
  ON "academic"."remedial_participants"("source_grade_id")
  WHERE "status" IN ('assigned', 'in_progress', 'submitted');

CREATE INDEX IF NOT EXISTS "remedial_participants_student_status_idx"
  ON "academic"."remedial_participants"("student_id", "status");

CREATE INDEX IF NOT EXISTS "remedial_participants_source_grade_status_idx"
  ON "academic"."remedial_participants"("source_grade_id", "status");

CREATE INDEX IF NOT EXISTS "remedial_participants_retry_root_idx"
  ON "academic"."remedial_participants"("retry_root_participant_id");

CREATE OR REPLACE FUNCTION academic.assert_teaching_assignment_context()
RETURNS TRIGGER AS $$
DECLARE
  matched_id UUID;
  context_subject VARCHAR(100);
  context_class_id UUID;
BEGIN
  IF TG_TABLE_NAME <> 'assessment_sessions' AND NEW.class_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'assessment_sessions' THEN
    IF NEW.purpose = 'remedial' THEN
      IF NEW.teaching_assignment_id IS NULL THEN
        RAISE EXCEPTION 'TeachingAssignment context is required for remedial assessment session'
          USING ERRCODE = 'foreign_key_violation';
      END IF;

      SELECT ta.id INTO matched_id
      FROM academic.teaching_assignments ta
      WHERE ta.id = NEW.teaching_assignment_id
        AND ta.teacher_id = NEW.teacher_id
        AND ta.class_id = NEW.class_id
        AND ta.academic_year = NEW.academic_year
      FOR KEY SHARE;

      IF matched_id IS NULL THEN
        RAISE EXCEPTION 'TeachingAssignment context is invalid for remedial assessment session'
          USING ERRCODE = 'foreign_key_violation';
      END IF;
      RETURN NEW;
    END IF;

    IF NEW.module_id IS NULL THEN
      RAISE EXCEPTION 'Regular assessment session requires module'
        USING ERRCODE = 'not_null_violation';
    END IF;

    SELECT lm.subject, lm.class_id INTO context_subject, context_class_id
    FROM academic.lms_modules lm
    WHERE lm.id = NEW.module_id;
  ELSE
    context_subject := NEW.subject;
    context_class_id := NEW.class_id;
  END IF;

  SELECT ta.id INTO matched_id
  FROM academic.teaching_assignments ta
  WHERE ta.teacher_id = NEW.teacher_id
    AND ta.class_id = COALESCE(context_class_id, NEW.class_id)
    AND lower(ta.subject) = lower(context_subject)
    AND ta.academic_year = NEW.academic_year
  FOR KEY SHARE;

  IF matched_id IS NULL THEN
    RAISE EXCEPTION 'TeachingAssignment context is required for %', TG_TABLE_NAME
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF TG_TABLE_NAME = 'assessment_sessions' THEN
    IF NEW.teaching_assignment_id IS NOT NULL
      AND NEW.teaching_assignment_id <> matched_id THEN
      RAISE EXCEPTION 'TeachingAssignment context does not match assessment module'
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NEW.teaching_assignment_id IS NULL THEN
      RAISE EXCEPTION 'TeachingAssignment context is required for new assessment session'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS assessment_assignment_context_guard ON academic.assessment_sessions;
CREATE TRIGGER assessment_assignment_context_guard
BEFORE INSERT OR UPDATE OF teacher_id, class_id, module_id, teaching_assignment_id, purpose, academic_year
ON academic.assessment_sessions FOR EACH ROW
EXECUTE FUNCTION academic.assert_teaching_assignment_context();

INSERT INTO "auth"."permissions" ("code", "description", "module")
VALUES
  ('academic.remedial.manage', 'Mengelola remedial pada TeachingAssignment sendiri', 'academic'),
  ('academic.remedial.read', 'Melihat registry remedial sesuai kewenangan', 'academic'),
  ('remedial.own.read', 'Melihat remedial sendiri (SISWA)', 'academic'),
  ('remedial.child.read', 'Melihat remedial anak (ORANG_TUA)', 'academic')
ON CONFLICT ("code") DO UPDATE
SET "description" = EXCLUDED."description",
    "module" = EXCLUDED."module";

INSERT INTO "auth"."role_permissions" ("role", "permission_id")
SELECT requested.role::"auth"."UserRole", perm."id"
FROM (
  VALUES
    ('SUPER_ADMIN', 'academic.remedial.read'),
    ('SUPER_ADMIN', 'remedial.own.read'),
    ('SUPER_ADMIN', 'remedial.child.read'),
    ('TATA_USAHA', 'announcement.manage'),
    ('GURU', 'academic.remedial.manage'),
    ('GURU', 'academic.remedial.read'),
    ('GURU', 'ai.chat'),
    ('SISWA', 'remedial.own.read'),
    ('ORANG_TUA', 'remedial.child.read')
) AS requested(role, permission_code)
JOIN "auth"."permissions" perm ON perm."code" = requested.permission_code
ON CONFLICT ("role", "permission_id") DO NOTHING;

INSERT INTO "school"."position_permissions" ("position_id", "permission_id")
SELECT pos."id", perm."id"
FROM (
  VALUES
    ('KEPALA_SEKOLAH', 'academic.remedial.read'),
    ('WAKA_KURIKULUM', 'academic.remedial.read')
) AS requested(position_code, permission_code)
JOIN "school"."positions" pos ON pos."code" = requested.position_code
JOIN "auth"."permissions" perm ON perm."code" = requested.permission_code
ON CONFLICT ("position_id", "permission_id") DO NOTHING;

DELETE FROM "school"."position_permissions" pp
USING "school"."positions" pos, "auth"."permissions" perm
WHERE pp."position_id" = pos."id"
  AND pp."permission_id" = perm."id"
  AND pos."code" = 'BENDAHARA'
  AND perm."code" = 'finance.approve';
