CREATE TABLE IF NOT EXISTS "academic"."assessment_event_outbox" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_type" VARCHAR(80) NOT NULL,
  "dedupe_key" VARCHAR(180) NOT NULL,
  "payload" JSONB NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "emitted_at" TIMESTAMP(3),
  "dead_letter_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "assessment_event_outbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assessment_event_outbox_dedupe_key_key" UNIQUE ("dedupe_key"),
  CONSTRAINT "assessment_event_outbox_status_chk" CHECK ("status" IN ('pending', 'emitting', 'emitted', 'failed', 'dead_letter'))
);

CREATE INDEX IF NOT EXISTS "assessment_event_outbox_status_created_at_idx"
  ON "academic"."assessment_event_outbox"("status", "created_at");

CREATE INDEX IF NOT EXISTS "assessment_event_outbox_status_next_attempt_at_idx"
  ON "academic"."assessment_event_outbox"("status", "next_attempt_at");

CREATE INDEX IF NOT EXISTS "assessment_event_outbox_event_type_created_at_idx"
  ON "academic"."assessment_event_outbox"("event_type", "created_at");
