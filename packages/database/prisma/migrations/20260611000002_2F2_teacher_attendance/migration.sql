-- 2F-2: Presensi Guru (KamilEdu M8) — additive CREATE-only + ALTER ADD COLUMN
-- Tidak ada DROP/ALTER destruktif.

-- Geofence config di school_profile (nullable = geofence nonaktif)
ALTER TABLE "school"."school_profile" ADD COLUMN IF NOT EXISTS "latitude" DECIMAL(9,6);
ALTER TABLE "school"."school_profile" ADD COLUMN IF NOT EXISTS "longitude" DECIMAL(9,6);
ALTER TABLE "school"."school_profile" ADD COLUMN IF NOT EXISTS "geofence_radius_m" INTEGER NOT NULL DEFAULT 300;

-- CreateTable
CREATE TABLE "teacher"."teacher_attendance" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "teacher_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "check_in_at" TIMESTAMP(3) NOT NULL,
    "check_out_at" TIMESTAMP(3),
    "lat_in" DECIMAL(9,6),
    "lng_in" DECIMAL(9,6),
    "lat_out" DECIMAL(9,6),
    "lng_out" DECIMAL(9,6),
    "distance_in_m" INTEGER,
    "outside_geofence" BOOLEAN NOT NULL DEFAULT false,
    "photo_url" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_attendance_pkey" PRIMARY KEY ("id")
);

-- Index & constraint
CREATE UNIQUE INDEX "teacher_attendance_teacher_id_date_key" ON "teacher"."teacher_attendance"("teacher_id", "date");
CREATE INDEX "teacher_attendance_date_idx" ON "teacher"."teacher_attendance"("date");

-- FK
ALTER TABLE "teacher"."teacher_attendance" ADD CONSTRAINT "teacher_attendance_teacher_id_fkey"
  FOREIGN KEY ("teacher_id") REFERENCES "teacher"."teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
