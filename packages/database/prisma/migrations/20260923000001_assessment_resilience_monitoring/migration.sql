ALTER TABLE "academic"."assessment_responses"
  ADD COLUMN "client_revision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "last_mutation_id" UUID,
  ADD COLUMN "last_saved_at" TIMESTAMP(3),
  ADD COLUMN "last_heartbeat_at" TIMESTAMP(3),
  ADD COLUMN "late_submission_status" VARCHAR(20),
  ADD COLUMN "late_answers" JSONB,
  ADD COLUMN "late_revision" INTEGER,
  ADD COLUMN "late_mutation_id" UUID,
  ADD COLUMN "late_submitted_at" TIMESTAMP(3),
  ADD COLUMN "late_reviewed_at" TIMESTAMP(3),
  ADD COLUMN "late_reviewed_by" VARCHAR(255),
  ADD COLUMN "late_review_note" TEXT;

ALTER TABLE "academic"."assessment_responses"
  ADD CONSTRAINT "assessment_responses_late_submission_status_check"
  CHECK ("late_submission_status" IS NULL OR "late_submission_status" IN ('pending', 'accepted', 'rejected'));

CREATE INDEX "assessment_responses_session_id_late_submission_status_idx"
  ON "academic"."assessment_responses"("session_id", "late_submission_status");

CREATE TABLE "academic"."assessment_integrity_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "response_id" UUID NOT NULL,
  "client_event_id" UUID NOT NULL,
  "type" VARCHAR(40) NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "received_after_submit" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "assessment_integrity_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "assessment_integrity_events_client_event_id_key"
  ON "academic"."assessment_integrity_events"("client_event_id");
CREATE INDEX "assessment_integrity_events_response_id_received_at_idx"
  ON "academic"."assessment_integrity_events"("response_id", "received_at");
CREATE INDEX "assessment_integrity_events_type_received_at_idx"
  ON "academic"."assessment_integrity_events"("type", "received_at");

ALTER TABLE "academic"."assessment_integrity_events"
  ADD CONSTRAINT "assessment_integrity_events_response_id_fkey"
  FOREIGN KEY ("response_id") REFERENCES "academic"."assessment_responses"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
