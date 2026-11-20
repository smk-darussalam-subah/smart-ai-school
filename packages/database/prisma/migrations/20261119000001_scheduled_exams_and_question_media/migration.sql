-- CreateTable
CREATE TABLE "academic"."question_media" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "teacher_id" UUID NOT NULL,
    "digest" CHAR(64) NOT NULL,
    "content_type" VARCHAR(20) NOT NULL,
    "bytes" BYTEA NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic"."exam_packages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "teacher_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "subject" VARCHAR(100) NOT NULL,
    "version" INTEGER NOT NULL,
    "questions" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic"."exam_schedules" (
    "session_id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "room" VARCHAR(80) NOT NULL,
    "room_key" VARCHAR(80) NOT NULL,
    "opens_at" TIMESTAMPTZ(3) NOT NULL,
    "latest_entry_at" TIMESTAMPTZ(3) NOT NULL,
    "closes_at" TIMESTAMPTZ(3) NOT NULL,
    "published_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "makeup_of_session_id" UUID,

    CONSTRAINT "exam_schedules_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "academic"."exam_participants" (
    "session_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "extra_minutes" INTEGER NOT NULL DEFAULT 0,
    "device_hash" CHAR(64),
    "device_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "exam_participants_pkey" PRIMARY KEY ("session_id","student_id")
);

-- CreateTable
CREATE TABLE "academic"."exam_proctors" (
    "session_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "exam_proctors_pkey" PRIMARY KEY ("session_id","user_id")
);

-- CreateTable
CREATE TABLE "academic"."exam_incidents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "kind" VARCHAR(24) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decision" VARCHAR(24),
    "decision_note" VARCHAR(500),
    "resolved_by" TEXT,
    "resolved_at" TIMESTAMPTZ(3),

    CONSTRAINT "exam_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "question_media_teacher_id_digest_key" ON "academic"."question_media"("teacher_id", "digest");

-- CreateIndex
CREATE UNIQUE INDEX "exam_packages_teacher_id_subject_title_version_key" ON "academic"."exam_packages"("teacher_id", "subject", "title", "version");

-- CreateIndex
CREATE INDEX "exam_schedules_opens_at_closes_at_idx" ON "academic"."exam_schedules"("opens_at", "closes_at");

-- CreateIndex
CREATE INDEX "exam_schedules_room_key_opens_at_idx" ON "academic"."exam_schedules"("room_key", "opens_at");

-- CreateIndex
CREATE INDEX "exam_participants_student_id_session_id_idx" ON "academic"."exam_participants"("student_id", "session_id");

-- CreateIndex
CREATE INDEX "exam_proctors_user_id_session_id_idx" ON "academic"."exam_proctors"("user_id", "session_id");

-- CreateIndex
CREATE INDEX "exam_incidents_session_id_created_at_idx" ON "academic"."exam_incidents"("session_id", "created_at");

-- AddForeignKey
ALTER TABLE "academic"."question_media" ADD CONSTRAINT "question_media_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teacher"."teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic"."exam_packages" ADD CONSTRAINT "exam_packages_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teacher"."teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic"."exam_schedules" ADD CONSTRAINT "exam_schedules_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "academic"."assessment_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic"."exam_schedules" ADD CONSTRAINT "exam_schedules_makeup_of_session_id_fkey" FOREIGN KEY ("makeup_of_session_id") REFERENCES "academic"."assessment_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic"."exam_schedules" ADD CONSTRAINT "exam_schedules_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "academic"."exam_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic"."exam_participants" ADD CONSTRAINT "exam_participants_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "academic"."exam_schedules"("session_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic"."exam_participants" ADD CONSTRAINT "exam_participants_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"."students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic"."exam_proctors" ADD CONSTRAINT "exam_proctors_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "academic"."exam_schedules"("session_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic"."exam_proctors" ADD CONSTRAINT "exam_proctors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic"."exam_incidents" ADD CONSTRAINT "exam_incidents_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "academic"."exam_schedules"("session_id") ON DELETE RESTRICT ON UPDATE CASCADE;

