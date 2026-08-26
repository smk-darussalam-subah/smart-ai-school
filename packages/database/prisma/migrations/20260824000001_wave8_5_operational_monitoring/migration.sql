-- Wave 8.5: server-authoritative bells, paired room displays, class sessions,
-- and durable operational alert delivery. This migration is additive except
-- for the approved fail-closed cutover of the legacy global kiosk credential.

CREATE TYPE "school"."BellScheduleScope" AS ENUM ('SCHOOL', 'RUANG_GURU', 'RUANG_TU');
CREATE TYPE "school"."BellScheduleKind" AS ENUM ('NORMAL', 'RAMADAN', 'EXAM', 'SPECIAL');
CREATE TYPE "school"."BellSegmentType" AS ENUM ('INSTRUCTION', 'BREAK', 'CEREMONY', 'OTHER');
CREATE TYPE "school"."DisplayDeviceProfile" AS ENUM ('RUANG_GURU', 'RUANG_TU');
CREATE TYPE "school"."DisplayDeviceStatus" AS ENUM ('PENDING', 'ACTIVE', 'REVOKED');

CREATE TYPE "academic"."ClassSessionStatus" AS ENUM (
  'SCHEDULED', 'REASSIGNED', 'STARTED', 'COMPLETED', 'MISSED', 'CANCELLED', 'SUPERSEDED'
);
CREATE TYPE "academic"."ClassSessionEventType" AS ENUM (
  'MATERIALIZED', 'STARTED', 'COMPLETED', 'MISSED', 'CANCELLED', 'REASSIGNED',
  'SUPERSEDED', 'RECOVERED', 'ALERT_CREATED', 'ALERT_CANCELLED'
);
CREATE TYPE "academic"."OperationalActorType" AS ENUM ('USER', 'DEVICE', 'SYSTEM');
CREATE TYPE "academic"."ClassSessionAlertStage" AS ENUM ('PRIVATE_T5', 'ROOM_T10', 'ESCALATION_T15');
CREATE TYPE "academic"."ClassSessionAlertStatus" AS ENUM ('PENDING', 'CLAIMED', 'DISPATCHED', 'CANCELLED');
CREATE TYPE "academic"."ClassSessionDeliveryStatus" AS ENUM (
  'PENDING', 'DELIVERED', 'PLAYED', 'ACKNOWLEDGED', 'CANCELLED'
);

CREATE TABLE "school"."bell_schedule_profiles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" VARCHAR(60) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "scope" "school"."BellScheduleScope" NOT NULL DEFAULT 'SCHOOL',
  "kind" "school"."BellScheduleKind" NOT NULL DEFAULT 'NORMAL',
  "timezone" VARCHAR(40) NOT NULL DEFAULT 'Asia/Jakarta',
  "effective_from" DATE NOT NULL,
  "effective_until" DATE,
  "provenance" VARCHAR(255) NOT NULL,
  "created_by" VARCHAR(255),
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bell_schedule_profiles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bell_schedule_profiles_code_key" UNIQUE ("code"),
  CONSTRAINT "bell_schedule_profiles_date_order_check"
    CHECK ("effective_until" IS NULL OR "effective_until" >= "effective_from"),
  CONSTRAINT "bell_schedule_profiles_timezone_check" CHECK ("timezone" = 'Asia/Jakarta')
);

CREATE INDEX "bell_schedule_profiles_scope_effective_idx"
  ON "school"."bell_schedule_profiles" ("scope", "effective_from", "effective_until");

ALTER TABLE "school"."bell_schedule_profiles"
  ADD CONSTRAINT "bell_schedule_profiles_no_effective_overlap"
  EXCLUDE USING gist (
    "scope" WITH =,
    daterange("effective_from", COALESCE("effective_until", 'infinity'::date), '[]') WITH &&
  ) WHERE ("revoked_at" IS NULL);

CREATE TABLE "school"."bell_schedule_segments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "profile_id" UUID NOT NULL,
  "jp_number" INTEGER,
  "label" VARCHAR(80) NOT NULL,
  "type" "school"."BellSegmentType" NOT NULL,
  "start_minute" INTEGER NOT NULL,
  "end_minute" INTEGER NOT NULL,
  "sort_order" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bell_schedule_segments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bell_schedule_segments_profile_fkey" FOREIGN KEY ("profile_id")
    REFERENCES "school"."bell_schedule_profiles"("id") ON DELETE CASCADE,
  CONSTRAINT "bell_schedule_segments_minute_check"
    CHECK ("start_minute" >= 0 AND "start_minute" < 1440 AND "end_minute" > 0
      AND "end_minute" <= 1440 AND "end_minute" > "start_minute"),
  CONSTRAINT "bell_schedule_segments_jp_check"
    CHECK (("type" = 'INSTRUCTION' AND "jp_number" BETWEEN 1 AND 16)
      OR ("type" <> 'INSTRUCTION' AND "jp_number" IS NULL)),
  CONSTRAINT "bell_schedule_segments_sort_check" CHECK ("sort_order" BETWEEN 1 AND 64),
  CONSTRAINT "bell_schedule_segments_profile_sort_key" UNIQUE ("profile_id", "sort_order"),
  CONSTRAINT "bell_schedule_segments_profile_jp_key" UNIQUE ("profile_id", "jp_number")
);

CREATE INDEX "bell_schedule_segments_profile_start_idx"
  ON "school"."bell_schedule_segments" ("profile_id", "start_minute");

ALTER TABLE "school"."bell_schedule_segments"
  ADD CONSTRAINT "bell_schedule_segments_no_overlap"
  EXCLUDE USING gist (
    "profile_id" WITH =,
    int4range("start_minute", "end_minute", '[)') WITH &&
  );

CREATE TABLE "school"."display_devices" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "profile" "school"."DisplayDeviceProfile" NOT NULL,
  "label" VARCHAR(100) NOT NULL,
  "status" "school"."DisplayDeviceStatus" NOT NULL DEFAULT 'PENDING',
  "credential_hash" CHAR(64),
  "credential_version" INTEGER NOT NULL DEFAULT 1,
  "created_by" VARCHAR(255) NOT NULL,
  "expires_at" TIMESTAMP(3),
  "activated_at" TIMESTAMP(3),
  "last_seen_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "audio_enabled" BOOLEAN NOT NULL DEFAULT false,
  "is_audible_leader" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "display_devices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "display_devices_credential_hash_key" UNIQUE ("credential_hash"),
  CONSTRAINT "display_devices_version_check" CHECK ("credential_version" > 0),
  CONSTRAINT "display_devices_leader_profile_check"
    CHECK (NOT "is_audible_leader" OR ("profile" = 'RUANG_GURU' AND "audio_enabled")),
  CONSTRAINT "display_devices_state_check" CHECK (
    ("status" = 'PENDING' AND "credential_hash" IS NULL AND "revoked_at" IS NULL)
    OR ("status" = 'ACTIVE' AND "credential_hash" IS NOT NULL
      AND "activated_at" IS NOT NULL AND "revoked_at" IS NULL)
    OR ("status" = 'REVOKED' AND "credential_hash" IS NULL AND "revoked_at" IS NOT NULL)
  )
);

CREATE INDEX "display_devices_profile_status_idx"
  ON "school"."display_devices" ("profile", "status");
CREATE INDEX "display_devices_last_seen_idx" ON "school"."display_devices" ("last_seen_at");
CREATE UNIQUE INDEX "display_devices_active_audible_leader_unique"
  ON "school"."display_devices" ("profile")
  WHERE "status" = 'ACTIVE' AND "revoked_at" IS NULL AND "is_audible_leader";

CREATE TABLE "school"."display_pairing_challenges" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "device_id" UUID NOT NULL,
  "challenge_hash" CHAR(64) NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 5,
  "consumed_at" TIMESTAMP(3),
  "created_by" VARCHAR(255) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "display_pairing_challenges_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "display_pairing_challenges_hash_key" UNIQUE ("challenge_hash"),
  CONSTRAINT "display_pairing_challenges_device_fkey" FOREIGN KEY ("device_id")
    REFERENCES "school"."display_devices"("id") ON DELETE CASCADE,
  CONSTRAINT "display_pairing_challenges_attempt_check"
    CHECK ("max_attempts" BETWEEN 1 AND 10 AND "attempts" BETWEEN 0 AND "max_attempts"),
  CONSTRAINT "display_pairing_challenges_expiry_check" CHECK ("expires_at" > "created_at")
);

CREATE INDEX "display_pairing_challenges_device_expiry_idx"
  ON "school"."display_pairing_challenges" ("device_id", "expires_at");
CREATE UNIQUE INDEX "display_pairing_challenges_one_open_per_device"
  ON "school"."display_pairing_challenges" ("device_id") WHERE "consumed_at" IS NULL;

CREATE TABLE "academic"."class_sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "schedule_id" UUID NOT NULL,
  "service_date" DATE NOT NULL,
  "academic_year_id" UUID NOT NULL,
  "semester_id" UUID NOT NULL,
  "bell_schedule_profile_id" UUID NOT NULL,
  "class_id" UUID NOT NULL,
  "teaching_assignment_id" UUID NOT NULL,
  "scheduled_teacher_id" UUID NOT NULL,
  "assigned_teacher_id" UUID NOT NULL,
  "class_name_snapshot" VARCHAR(100) NOT NULL,
  "subject_snapshot" VARCHAR(120) NOT NULL,
  "scheduled_teacher_name" VARCHAR(255) NOT NULL,
  "assigned_teacher_name" VARCHAR(255) NOT NULL,
  "room_snapshot" VARCHAR(80),
  "scheduled_start_at" TIMESTAMPTZ(3) NOT NULL,
  "scheduled_end_at" TIMESTAMPTZ(3) NOT NULL,
  "status" "academic"."ClassSessionStatus" NOT NULL DEFAULT 'SCHEDULED',
  "version" INTEGER NOT NULL DEFAULT 1,
  "started_at" TIMESTAMPTZ(3),
  "started_by" VARCHAR(255),
  "completed_at" TIMESTAMPTZ(3),
  "completed_by" VARCHAR(255),
  "missed_at" TIMESTAMPTZ(3),
  "cancelled_at" TIMESTAMPTZ(3),
  "cancelled_by" VARCHAR(255),
  "cancellation_reason" VARCHAR(500),
  "reassigned_at" TIMESTAMPTZ(3),
  "reassigned_by" VARCHAR(255),
  "reassignment_reason" VARCHAR(500),
  "superseded_at" TIMESTAMPTZ(3),
  "superseded_by" VARCHAR(255),
  "supersede_reason" VARCHAR(500),
  "late_by_minutes" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "class_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "class_sessions_schedule_date_key" UNIQUE ("schedule_id", "service_date"),
  CONSTRAINT "class_sessions_schedule_fkey" FOREIGN KEY ("schedule_id")
    REFERENCES "academic"."schedules"("id") ON DELETE RESTRICT,
  CONSTRAINT "class_sessions_academic_year_fkey" FOREIGN KEY ("academic_year_id")
    REFERENCES "school"."academic_years"("id") ON DELETE RESTRICT,
  CONSTRAINT "class_sessions_semester_fkey" FOREIGN KEY ("semester_id")
    REFERENCES "school"."semesters"("id") ON DELETE RESTRICT,
  CONSTRAINT "class_sessions_bell_profile_fkey" FOREIGN KEY ("bell_schedule_profile_id")
    REFERENCES "school"."bell_schedule_profiles"("id") ON DELETE RESTRICT,
  CONSTRAINT "class_sessions_class_fkey" FOREIGN KEY ("class_id")
    REFERENCES "academic"."classes"("id") ON DELETE RESTRICT,
  CONSTRAINT "class_sessions_assignment_fkey" FOREIGN KEY ("teaching_assignment_id")
    REFERENCES "academic"."teaching_assignments"("id") ON DELETE RESTRICT,
  CONSTRAINT "class_sessions_scheduled_teacher_fkey" FOREIGN KEY ("scheduled_teacher_id")
    REFERENCES "teacher"."teachers"("id") ON DELETE RESTRICT,
  CONSTRAINT "class_sessions_assigned_teacher_fkey" FOREIGN KEY ("assigned_teacher_id")
    REFERENCES "teacher"."teachers"("id") ON DELETE RESTRICT,
  CONSTRAINT "class_sessions_time_order_check" CHECK ("scheduled_end_at" > "scheduled_start_at"),
  CONSTRAINT "class_sessions_version_check" CHECK ("version" > 0),
  CONSTRAINT "class_sessions_late_check" CHECK ("late_by_minutes" IS NULL OR "late_by_minutes" >= 0),
  CONSTRAINT "class_sessions_lifecycle_check" CHECK (
    ("status" IN ('SCHEDULED', 'REASSIGNED') AND "started_at" IS NULL AND "completed_at" IS NULL)
    OR ("status" = 'STARTED' AND "started_at" IS NOT NULL AND "completed_at" IS NULL)
    OR ("status" = 'COMPLETED' AND "started_at" IS NOT NULL AND "completed_at" IS NOT NULL)
    OR ("status" = 'MISSED' AND "missed_at" IS NOT NULL AND "started_at" IS NULL)
    OR ("status" = 'CANCELLED' AND "cancelled_at" IS NOT NULL)
    OR ("status" = 'SUPERSEDED' AND "superseded_at" IS NOT NULL)
  )
);

CREATE INDEX "class_sessions_date_status_idx" ON "academic"."class_sessions" ("service_date", "status");
CREATE INDEX "class_sessions_teacher_date_idx" ON "academic"."class_sessions" ("assigned_teacher_id", "service_date");
CREATE INDEX "class_sessions_class_date_idx" ON "academic"."class_sessions" ("class_id", "service_date");

CREATE TABLE "academic"."class_session_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "session_id" UUID NOT NULL,
  "event_type" "academic"."ClassSessionEventType" NOT NULL,
  "event_key" VARCHAR(180) NOT NULL,
  "actor_type" "academic"."OperationalActorType" NOT NULL,
  "actor_id" VARCHAR(255),
  "reason" VARCHAR(500),
  "metadata" JSONB,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "class_session_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "class_session_events_event_key_key" UNIQUE ("event_key"),
  CONSTRAINT "class_session_events_session_fkey" FOREIGN KEY ("session_id")
    REFERENCES "academic"."class_sessions"("id") ON DELETE CASCADE
);
CREATE INDEX "class_session_events_session_occurred_idx"
  ON "academic"."class_session_events" ("session_id", "occurred_at");

CREATE TABLE "academic"."class_session_alerts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "session_id" UUID NOT NULL,
  "stage" "academic"."ClassSessionAlertStage" NOT NULL,
  "due_at" TIMESTAMPTZ(3) NOT NULL,
  "status" "academic"."ClassSessionAlertStatus" NOT NULL DEFAULT 'PENDING',
  "claim_token" UUID,
  "claimed_at" TIMESTAMPTZ(3),
  "lease_until" TIMESTAMPTZ(3),
  "dispatched_at" TIMESTAMPTZ(3),
  "cancelled_at" TIMESTAMPTZ(3),
  "cancellation_reason" VARCHAR(500),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "class_session_alerts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "class_session_alerts_session_stage_key" UNIQUE ("session_id", "stage"),
  CONSTRAINT "class_session_alerts_session_fkey" FOREIGN KEY ("session_id")
    REFERENCES "academic"."class_sessions"("id") ON DELETE CASCADE,
  CONSTRAINT "class_session_alerts_claim_check" CHECK (
    ("status" = 'CLAIMED' AND "claim_token" IS NOT NULL AND "claimed_at" IS NOT NULL AND "lease_until" IS NOT NULL)
    OR ("status" <> 'CLAIMED')
  )
);
CREATE INDEX "class_session_alerts_status_due_idx" ON "academic"."class_session_alerts" ("status", "due_at");
CREATE INDEX "class_session_alerts_lease_idx" ON "academic"."class_session_alerts" ("lease_until");

CREATE TABLE "academic"."class_session_alert_deliveries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "alert_id" UUID NOT NULL,
  "device_id" UUID NOT NULL,
  "status" "academic"."ClassSessionDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "audible" BOOLEAN NOT NULL DEFAULT false,
  "delivered_at" TIMESTAMPTZ(3),
  "played_at" TIMESTAMPTZ(3),
  "cancelled_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "class_session_alert_deliveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "class_session_alert_deliveries_alert_device_key" UNIQUE ("alert_id", "device_id"),
  CONSTRAINT "class_session_alert_deliveries_alert_fkey" FOREIGN KEY ("alert_id")
    REFERENCES "academic"."class_session_alerts"("id") ON DELETE CASCADE,
  CONSTRAINT "class_session_alert_deliveries_device_fkey" FOREIGN KEY ("device_id")
    REFERENCES "school"."display_devices"("id") ON DELETE RESTRICT,
  CONSTRAINT "class_session_alert_deliveries_state_check" CHECK (
    ("status" = 'PENDING')
    OR ("status" = 'DELIVERED' AND "delivered_at" IS NOT NULL)
    OR ("status" = 'PLAYED' AND "delivered_at" IS NOT NULL AND "played_at" IS NOT NULL)
    OR ("status" = 'ACKNOWLEDGED' AND "delivered_at" IS NOT NULL)
    OR ("status" = 'CANCELLED' AND "cancelled_at" IS NOT NULL)
  )
);
CREATE INDEX "class_session_alert_deliveries_device_status_idx"
  ON "academic"."class_session_alert_deliveries" ("device_id", "status", "created_at");

CREATE TABLE "academic"."class_session_alert_acknowledgements" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "delivery_id" UUID NOT NULL,
  "actor_device_id" UUID NOT NULL,
  "reason" VARCHAR(500),
  "acknowledged_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "class_session_alert_acknowledgements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "class_session_alert_acknowledgements_delivery_key" UNIQUE ("delivery_id"),
  CONSTRAINT "class_session_alert_acknowledgements_delivery_fkey" FOREIGN KEY ("delivery_id")
    REFERENCES "academic"."class_session_alert_deliveries"("id") ON DELETE CASCADE,
  CONSTRAINT "class_session_alert_acknowledgements_device_fkey" FOREIGN KEY ("actor_device_id")
    REFERENCES "school"."display_devices"("id") ON DELETE RESTRICT
);
CREATE INDEX "class_session_alert_ack_device_time_idx"
  ON "academic"."class_session_alert_acknowledgements" ("actor_device_id", "acknowledged_at");

-- Official bell baseline copied exactly from apps/web/src/lib/bell-times.ts,
-- confirmed 2026-06-13. The open-ended profile is intentionally explicit;
-- future Ramadan/exam profiles must first close this effective range.
INSERT INTO "school"."bell_schedule_profiles" (
  "code", "name", "scope", "kind", "timezone", "effective_from", "provenance"
) VALUES (
  'REGULAR-2026', 'Jadwal Bel Reguler', 'SCHOOL', 'NORMAL', 'Asia/Jakarta', DATE '2026-01-01',
  'migration:20260824000001;source:apps/web/src/lib/bell-times.ts;confirmed:2026-06-13'
);

INSERT INTO "school"."bell_schedule_segments"
  ("profile_id", "jp_number", "label", "type", "start_minute", "end_minute", "sort_order")
SELECT p."id", v.jp, v.label, v.type::"school"."BellSegmentType", v.start_minute, v.end_minute, v.sort_order
FROM "school"."bell_schedule_profiles" p
CROSS JOIN (VALUES
  (1, 'JP 1', 'INSTRUCTION', 450, 490, 1),
  (2, 'JP 2', 'INSTRUCTION', 490, 530, 2),
  (3, 'JP 3', 'INSTRUCTION', 530, 570, 3),
  (NULL, 'Istirahat 1', 'BREAK', 570, 585, 4),
  (4, 'JP 4', 'INSTRUCTION', 585, 625, 5),
  (5, 'JP 5', 'INSTRUCTION', 625, 665, 6),
  (6, 'JP 6', 'INSTRUCTION', 665, 705, 7),
  (NULL, 'Istirahat 2', 'BREAK', 705, 745, 8),
  (7, 'JP 7', 'INSTRUCTION', 745, 785, 9),
  (8, 'JP 8', 'INSTRUCTION', 785, 825, 10)
) AS v(jp, label, type, start_minute, end_minute, sort_order)
WHERE p."code" = 'REGULAR-2026';

-- Fail-closed cutover. The deprecated column remains for additive schema
-- compatibility, but no bearer credential survives this migration.
UPDATE "school"."school_profile" SET "kiosk_token" = NULL WHERE "kiosk_token" IS NOT NULL;

INSERT INTO "auth"."permissions" ("code", "description", "module") VALUES
  ('operational.monitoring.read', 'Melihat monitoring operasional pembelajaran', 'operational'),
  ('operational.display.manage', 'Mengelola kredensial perangkat display sekolah', 'operational'),
  ('academic.class-session.read', 'Melihat sesi pembelajaran authoritative', 'academic'),
  ('academic.class-session.manage', 'Memulai dan menyelesaikan sesi pembelajaran sendiri', 'academic')
ON CONFLICT ("code") DO UPDATE
SET "description" = EXCLUDED."description", "module" = EXCLUDED."module";

INSERT INTO "auth"."role_permissions" ("role", "permission_id")
SELECT requested.role::"auth"."UserRole", permission."id"
FROM (VALUES
  ('GURU', 'academic.class-session.read'),
  ('GURU', 'academic.class-session.manage'),
  ('TATA_USAHA', 'operational.monitoring.read')
) AS requested(role, permission_code)
JOIN "auth"."permissions" permission ON permission."code" = requested.permission_code
ON CONFLICT ("role", "permission_id") DO NOTHING;

INSERT INTO "school"."position_permissions" ("position_id", "permission_id")
SELECT position."id", permission."id"
FROM (VALUES
  ('KEPALA_SEKOLAH', 'operational.monitoring.read'),
  ('KEPALA_SEKOLAH', 'operational.display.manage'),
  ('KEPALA_SEKOLAH', 'academic.class-session.read'),
  ('WAKA_KURIKULUM', 'academic.class-session.read'),
  ('KAPROG', 'academic.class-session.read')
) AS requested(position_code, permission_code)
JOIN "school"."positions" position ON position."code" = requested.position_code
JOIN "auth"."permissions" permission ON permission."code" = requested.permission_code
ON CONFLICT ("position_id", "permission_id") DO NOTHING;
