ALTER TABLE "academic"."assessment_sessions"
  ADD COLUMN IF NOT EXISTS "grade_target" "academic"."GradeType";

ALTER TABLE "academic"."assessment_responses"
  ADD COLUMN IF NOT EXISTS "question_order" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "item_scores" JSONB;

ALTER TABLE "academic"."grades"
  ADD COLUMN IF NOT EXISTS "source_assessment_session_id" UUID;

CREATE INDEX IF NOT EXISTS "grades_source_assessment_session_id_idx"
  ON "academic"."grades"("source_assessment_session_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'grades_source_assessment_session_id_fkey'
      AND connamespace = 'academic'::regnamespace
  ) THEN
    ALTER TABLE "academic"."grades"
      ADD CONSTRAINT "grades_source_assessment_session_id_fkey"
      FOREIGN KEY ("source_assessment_session_id")
      REFERENCES "academic"."assessment_sessions"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "grades_source_assessment_session_id_student_id_key"
  ON "academic"."grades"("source_assessment_session_id", "student_id");
