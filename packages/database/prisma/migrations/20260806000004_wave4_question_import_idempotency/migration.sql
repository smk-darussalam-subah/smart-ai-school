CREATE TABLE IF NOT EXISTS "academic"."question_import_rows" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "teacher_id" UUID NOT NULL,
  "batch_key" VARCHAR(120) NOT NULL,
  "row_key" VARCHAR(120) NOT NULL,
  "payload_fingerprint" VARCHAR(64) NOT NULL,
  "question_id" UUID,
  "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "question_import_rows_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "question_import_rows_teacher_id_batch_key_row_key_key" UNIQUE ("teacher_id", "batch_key", "row_key"),
  CONSTRAINT "question_import_rows_status_chk" CHECK ("status" IN ('pending', 'imported', 'failed'))
);

CREATE INDEX IF NOT EXISTS "question_import_rows_teacher_id_batch_key_idx"
  ON "academic"."question_import_rows"("teacher_id", "batch_key");

CREATE INDEX IF NOT EXISTS "question_import_rows_question_id_idx"
  ON "academic"."question_import_rows"("question_id");
