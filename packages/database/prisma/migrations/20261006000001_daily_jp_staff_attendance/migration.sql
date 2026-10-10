-- DropIndex
ALTER TABLE "school"."bell_schedule_segments" DROP CONSTRAINT IF EXISTS "bell_schedule_segments_profile_sort_key";
DROP INDEX IF EXISTS "school"."bell_schedule_segments_profile_id_sort_order_key";

-- DropIndex
ALTER TABLE "school"."bell_schedule_segments" DROP CONSTRAINT IF EXISTS "bell_schedule_segments_profile_jp_key";
DROP INDEX IF EXISTS "school"."bell_schedule_segments_profile_id_jp_number_key";

-- AlterTable
ALTER TABLE "academic"."schedules" ADD COLUMN     "concurrency_group_id" UUID;

-- AlterTable
ALTER TABLE "school"."bell_schedule_segments" ADD COLUMN     "day_of_week" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "school"."school_profile" ADD COLUMN     "attendance_accuracy_m" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "attendance_end_minute" INTEGER NOT NULL DEFAULT 900,
ADD COLUMN     "attendance_mode" VARCHAR(10) NOT NULL DEFAULT 'REVIEW',
ADD COLUMN     "attendance_prompt_cooldown" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "attendance_start_minute" INTEGER NOT NULL DEFAULT 420,
ADD COLUMN     "attendance_working_days" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5, 6]::INTEGER[];

-- CreateTable
CREATE TABLE "academic"."schedule_concurrency_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "teacher_id" UUID NOT NULL,
    "mode" VARCHAR(30) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "approved_by" VARCHAR(255) NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "jp_start" INTEGER NOT NULL,
    "jp_end" INTEGER NOT NULL,
    "academic_year" VARCHAR(9) NOT NULL,
    "semester" INTEGER NOT NULL,
    "expires_on" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_concurrency_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school"."staff_attendance" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "check_in_at" TIMESTAMP(3) NOT NULL,
    "check_out_at" TIMESTAMP(3),
    "location_in_status" VARCHAR(30) NOT NULL,
    "location_out_status" VARCHAR(30),
    "location_in_reason" VARCHAR(60),
    "location_out_reason" VARCHAR(60),
    "distance_in_m" INTEGER,
    "distance_out_m" INTEGER,
    "accuracy_in_m" DOUBLE PRECISION,
    "accuracy_out_m" DOUBLE PRECISION,
    "lat_in" DECIMAL(9,6),
    "lng_in" DECIMAL(9,6),
    "lat_out" DECIMAL(9,6),
    "lng_out" DECIMAL(9,6),
    "notes" TEXT,
    "legacy_teacher_attendance_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school"."staff_attendance_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "attendance_id" UUID NOT NULL,
    "actor_id" VARCHAR(255) NOT NULL,
    "kind" VARCHAR(30) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_attendance_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_attendance_legacy_teacher_attendance_id_key" ON "school"."staff_attendance"("legacy_teacher_attendance_id");

-- CreateIndex
CREATE INDEX "staff_attendance_date_idx" ON "school"."staff_attendance"("date");

-- CreateIndex
CREATE UNIQUE INDEX "staff_attendance_user_id_date_key" ON "school"."staff_attendance"("user_id", "date");

-- CreateIndex
CREATE INDEX "staff_attendance_events_attendance_id_created_at_idx" ON "school"."staff_attendance_events"("attendance_id", "created_at");

-- CreateIndex
CREATE INDEX "schedules_concurrency_group_id_idx" ON "academic"."schedules"("concurrency_group_id");

-- CreateIndex
CREATE UNIQUE INDEX "bell_schedule_segments_profile_id_day_of_week_sort_order_key" ON "school"."bell_schedule_segments"("profile_id", "day_of_week", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "bell_schedule_segments_profile_id_day_of_week_jp_number_key" ON "school"."bell_schedule_segments"("profile_id", "day_of_week", "jp_number");

-- AddForeignKey
ALTER TABLE "academic"."schedules" ADD CONSTRAINT "schedules_concurrency_group_id_fkey" FOREIGN KEY ("concurrency_group_id") REFERENCES "academic"."schedule_concurrency_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school"."staff_attendance" ADD CONSTRAINT "staff_attendance_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school"."staff_attendance_events" ADD CONSTRAINT "staff_attendance_events_attendance_id_fkey" FOREIGN KEY ("attendance_id") REFERENCES "school"."staff_attendance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Preserve legacy time patterns; all new daily patterns have independent range constraints.
ALTER TABLE school.bell_schedule_segments DROP CONSTRAINT IF EXISTS bell_schedule_segments_no_overlap;
ALTER TABLE school.bell_schedule_segments ADD CONSTRAINT bell_schedule_segments_day_check CHECK (day_of_week BETWEEN 0 AND 6);
ALTER TABLE school.bell_schedule_segments ADD CONSTRAINT bell_schedule_segments_no_overlap
 EXCLUDE USING gist (profile_id WITH =, day_of_week WITH =, int4range(start_minute, end_minute, '[)') WITH &&);
ALTER TABLE academic.schedule_concurrency_groups ADD CONSTRAINT concurrency_valid CHECK (
 mode IN ('JOINT_CLASS', 'AUTHORIZED_EXCEPTION') AND day_of_week BETWEEN 1 AND 6 AND jp_start >= 1
 AND jp_end >= jp_start AND semester BETWEEN 1 AND 2 AND length(trim(reason)) >= 10
 AND (mode <> 'AUTHORIZED_EXCEPTION' OR expires_on IS NOT NULL));
ALTER TABLE academic.schedule_concurrency_groups ADD CONSTRAINT concurrency_teacher_fkey
 FOREIGN KEY (teacher_id) REFERENCES teacher.teachers(id) ON DELETE RESTRICT;
ALTER TABLE school.staff_attendance ADD CONSTRAINT attendance_location_status_check CHECK (
 location_in_status IN ('INSIDE', 'OUTSIDE', 'UNVERIFIED', 'DISABLED')
 AND (location_out_status IS NULL OR location_out_status IN ('INSIDE', 'OUTSIDE', 'UNVERIFIED', 'DISABLED'))
 AND (check_out_at IS NULL OR check_out_at >= check_in_at));
ALTER TABLE school.school_profile ADD CONSTRAINT attendance_policy_valid CHECK (
 attendance_mode IN ('REVIEW', 'STRICT') AND attendance_accuracy_m BETWEEN 5 AND 500
 AND attendance_start_minute BETWEEN 0 AND 1439 AND attendance_end_minute > attendance_start_minute
 AND attendance_end_minute <= 1440 AND attendance_prompt_cooldown BETWEEN 5 AND 240);

-- No legacy row is removed. Unknown GPS/checkout verification is not reconstructed.
INSERT INTO school.staff_attendance (id, user_id, date, check_in_at, check_out_at,
 location_in_status, location_out_status, location_in_reason, location_out_reason,
 distance_in_m, lat_in, lng_in, lat_out, lng_out, notes, legacy_teacher_attendance_id, created_at, updated_at)
 SELECT a.id, t.user_id, a.date, a.check_in_at, a.check_out_at,
 CASE WHEN a.distance_in_m IS NULL THEN 'UNVERIFIED' WHEN a.outside_geofence THEN 'OUTSIDE' ELSE 'INSIDE' END,
 CASE WHEN a.check_out_at IS NOT NULL THEN 'UNVERIFIED' END,
 'LEGACY_GEOMETRY', CASE WHEN a.check_out_at IS NOT NULL THEN 'LEGACY_NOT_VERIFIED' END,
 a.distance_in_m, a.lat_in, a.lng_in, a.lat_out, a.lng_out, a.notes, a.id, a.created_at, a.updated_at
 FROM teacher.teacher_attendance a JOIN teacher.teachers t ON t.id = a.teacher_id
 ON CONFLICT (user_id, date) DO NOTHING;
INSERT INTO school.staff_attendance_events (attendance_id, actor_id, kind, reason, after)
 SELECT id, 'migration:20261006000001', 'LEGACY_IMPORT', 'Salinan presensi guru; rekaman sumber tetap utuh',
 jsonb_build_object('legacyTeacherAttendanceId', legacy_teacher_attendance_id, 'locationInStatus', location_in_status)
 FROM school.staff_attendance WHERE legacy_teacher_attendance_id IS NOT NULL;

CREATE FUNCTION school.protect_attendance_event() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN RAISE EXCEPTION 'Attendance events are append-only'; END;
$$;
CREATE TRIGGER staff_attendance_event_immutable BEFORE UPDATE OR DELETE ON school.staff_attendance_events
 FOR EACH ROW EXECUTE FUNCTION school.protect_attendance_event();

INSERT INTO auth.permissions (code, description, module) VALUES
 ('staff.attendance.checkin', 'Presensi mandiri pegawai aktif', 'attendance'),
 ('staff.attendance.read', 'Baca rekap presensi pegawai', 'attendance'),
 ('staff.attendance.manage', 'Koreksi dan kebijakan presensi pegawai', 'attendance')
 ON CONFLICT (code) DO NOTHING;
INSERT INTO auth.role_permissions (role, permission_id)
 SELECT role::auth."UserRole", p.id FROM auth.permissions p CROSS JOIN
 (VALUES ('SUPER_ADMIN'), ('KEPALA_SEKOLAH'), ('TATA_USAHA'), ('GURU')) AS r(role)
 WHERE p.code = 'staff.attendance.checkin' ON CONFLICT DO NOTHING;
INSERT INTO auth.role_permissions (role, permission_id)
 SELECT role::auth."UserRole", p.id FROM auth.permissions p CROSS JOIN
 (VALUES ('SUPER_ADMIN'), ('KEPALA_SEKOLAH'), ('TATA_USAHA')) AS r(role)
 WHERE p.code = 'staff.attendance.read' ON CONFLICT DO NOTHING;

