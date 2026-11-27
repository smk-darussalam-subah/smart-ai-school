-- AlterTable
ALTER TABLE "academic"."exam_packages" ADD COLUMN     "shared_for_programs" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "academic"."exam_participants" ADD COLUMN     "roster_class_id" UUID;

-- CreateTable
CREATE TABLE "academic"."assessment_kinds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(80) NOT NULL,
    "name_key" VARCHAR(100) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "category" VARCHAR(16) NOT NULL DEFAULT 'custom',
    "allows_grade" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_kinds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic"."assessment_programs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" UUID NOT NULL,
    "request_fingerprint" CHAR(64) NOT NULL,
    "owner_id" UUID NOT NULL,
    "kind_id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "enumeration_mode" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic"."assessment_program_classes" (
    "program_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "assignment_id" UUID,

    CONSTRAINT "assessment_program_classes_pkey" PRIMARY KEY ("program_id","class_id")
);

-- CreateTable
CREATE TABLE "academic"."assessment_program_profiles" (
    "program_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "instrument" VARCHAR(180) NOT NULL,
    "instrument_version" VARCHAR(40) NOT NULL,
    "observations" JSONB NOT NULL,
    "summary" VARCHAR(1600) NOT NULL,
    "next_steps" VARCHAR(1600) NOT NULL,
    "published_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "assessment_program_profiles_pkey" PRIMARY KEY ("program_id","student_id")
);

-- CreateTable
CREATE TABLE "academic"."exam_schedule_requests" (
    "session_id" UUID NOT NULL,
    "requester_id" UUID NOT NULL,
    "package_id" UUID,
    "exam_date" DATE,
    "room" VARCHAR(80),
    "opens_at" TIMESTAMPTZ(3),
    "latest_entry_at" TIMESTAMPTZ(3),
    "closes_at" TIMESTAMPTZ(3),
    "proctor_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "revision" INTEGER NOT NULL DEFAULT 1,
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "exam_schedule_requests_pkey" PRIMARY KEY ("session_id")
);

-- CreateIndex
CREATE INDEX "assessment_kinds_active_name_idx" ON "academic"."assessment_kinds"("active", "name");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_kinds_name_key_version_key" ON "academic"."assessment_kinds"("name_key", "version");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_programs_session_id_key" ON "academic"."assessment_programs"("session_id");

-- CreateIndex
CREATE INDEX "assessment_programs_kind_id_idx" ON "academic"."assessment_programs"("kind_id");

-- CreateIndex
CREATE INDEX "assessment_programs_package_id_idx" ON "academic"."assessment_programs"("package_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_programs_owner_id_request_id_key" ON "academic"."assessment_programs"("owner_id", "request_id");

-- CreateIndex
CREATE INDEX "assessment_program_classes_class_id_idx" ON "academic"."assessment_program_classes"("class_id");

-- CreateIndex
CREATE INDEX "assessment_program_classes_assignment_id_idx" ON "academic"."assessment_program_classes"("assignment_id");

-- CreateIndex
CREATE INDEX "assessment_program_profiles_student_id_published_at_idx" ON "academic"."assessment_program_profiles"("student_id", "published_at");

-- CreateIndex
CREATE INDEX "exam_schedule_requests_requester_id_requested_at_idx" ON "academic"."exam_schedule_requests"("requester_id", "requested_at");

-- CreateIndex
CREATE INDEX "exam_schedule_requests_requested_at_session_id_idx" ON "academic"."exam_schedule_requests"("requested_at", "session_id");

-- CreateIndex
CREATE INDEX "exam_participants_roster_class_id_idx" ON "academic"."exam_participants"("roster_class_id");

-- AddForeignKey
ALTER TABLE "academic"."assessment_kinds" ADD CONSTRAINT "assessment_kinds_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic"."assessment_programs" ADD CONSTRAINT "assessment_programs_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic"."assessment_programs" ADD CONSTRAINT "assessment_programs_kind_id_fkey" FOREIGN KEY ("kind_id") REFERENCES "academic"."assessment_kinds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic"."assessment_programs" ADD CONSTRAINT "assessment_programs_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "academic"."exam_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic"."assessment_programs" ADD CONSTRAINT "assessment_programs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "academic"."assessment_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic"."assessment_program_classes" ADD CONSTRAINT "assessment_program_classes_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "academic"."assessment_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic"."assessment_program_classes" ADD CONSTRAINT "assessment_program_classes_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "academic"."classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic"."assessment_program_classes" ADD CONSTRAINT "assessment_program_classes_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "academic"."teaching_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic"."assessment_program_profiles" ADD CONSTRAINT "assessment_program_profiles_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "academic"."assessment_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic"."assessment_program_profiles" ADD CONSTRAINT "assessment_program_profiles_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"."students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic"."exam_schedule_requests" ADD CONSTRAINT "exam_schedule_requests_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "academic"."assessment_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic"."exam_schedule_requests" ADD CONSTRAINT "exam_schedule_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic"."exam_schedule_requests" ADD CONSTRAINT "exam_schedule_requests_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "academic"."exam_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic"."exam_participants" ADD CONSTRAINT "exam_participants_roster_class_id_fkey" FOREIGN KEY ("roster_class_id") REFERENCES "academic"."classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "academic"."assessment_kinds"
  ADD CONSTRAINT "assessment_kinds_category_check"
  CHECK ("category" IN ('simulation', 'profile', 'custom') AND ("category" = 'custom' OR NOT "allows_grade"));
ALTER TABLE "academic"."assessment_programs"
  ADD CONSTRAINT "assessment_programs_roster_mode_check"
  CHECK ("enumeration_mode" IN ('all', 'classes', 'grades'));
ALTER TABLE "academic"."exam_schedule_requests"
  ADD CONSTRAINT "exam_schedule_requests_revision_check" CHECK ("revision" > 0),
  ADD CONSTRAINT "exam_schedule_requests_time_check"
  CHECK (("opens_at" IS NULL OR "closes_at" IS NULL OR "opens_at" < "closes_at")
    AND ("opens_at" IS NULL OR "latest_entry_at" IS NULL OR "opens_at" <= "latest_entry_at")
    AND ("latest_entry_at" IS NULL OR "closes_at" IS NULL OR "latest_entry_at" <= "closes_at"));

INSERT INTO "academic"."assessment_kinds" ("name", "name_key", "category") VALUES
  ('Simulasi', 'simulasi', 'simulation'),
  ('Bakat dan Minat', 'bakat dan minat', 'profile');

-- A school program has its own validated roster. Ordinary LMS and remedial
-- sessions retain the prior rules; a program must exist by transaction commit.
ALTER TABLE "academic"."assessment_sessions"
  ADD COLUMN "school_program" BOOLEAN NOT NULL DEFAULT false,
  DROP CONSTRAINT "assessment_sessions_purpose_context_ck",
  ADD CONSTRAINT "assessment_sessions_purpose_context_ck" CHECK (
    (NOT "school_program" AND (
      ("purpose" = 'regular' AND "module_id" IS NOT NULL)
      OR ("purpose" = 'remedial' AND "teaching_assignment_id" IS NOT NULL)
    ))
    OR ("school_program" AND "purpose" = 'regular' AND "module_id" IS NULL
      AND "teaching_assignment_id" IS NULL AND "class_id" IS NULL)
  );

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
    IF NEW.school_program THEN
      RETURN NEW;
    END IF;
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

CREATE FUNCTION academic.assert_school_program_context()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM academic.assessment_programs p WHERE p.session_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'School program session requires its program record'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER assessment_school_program_guard
AFTER INSERT OR UPDATE OF school_program ON academic.assessment_sessions
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
WHEN (NEW.school_program)
EXECUTE FUNCTION academic.assert_school_program_context();
