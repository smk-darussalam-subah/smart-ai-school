-- U2: Assessment Comprehensive (GAP-6)
-- Adds timer, randomization, essay rubric, and response timing fields.
-- All new fields are nullable/default — backward compatible.

-- AssessmentSession: timer + randomization
ALTER TABLE "academic"."assessment_sessions" ADD COLUMN "duration_minutes" INTEGER;
ALTER TABLE "academic"."assessment_sessions" ADD COLUMN "randomize_order" BOOLEAN NOT NULL DEFAULT false;

-- AssessmentResponse: per-student timing
ALTER TABLE "academic"."assessment_responses" ADD COLUMN "started_at" TIMESTAMP(6);
ALTER TABLE "academic"."assessment_responses" ADD COLUMN "time_spent_sec" INTEGER;

-- Question: essay rubric (JSONB array of criteria)
ALTER TABLE "academic"."questions" ADD COLUMN "rubric" JSONB;
