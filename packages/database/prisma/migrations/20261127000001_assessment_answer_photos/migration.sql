ALTER TABLE "academic"."questions"
  ADD COLUMN "allow_answer_photos" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "academic"."assessment_answer_photos" (
  "id" UUID NOT NULL,
  "response_id" UUID NOT NULL,
  "question_id" UUID NOT NULL,
  "digest" CHAR(64) NOT NULL,
  "content_type" VARCHAR(20) NOT NULL,
  "bytes" BYTEA NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assessment_answer_photos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assessment_answer_photos_response_id_fkey"
    FOREIGN KEY ("response_id") REFERENCES "academic"."assessment_responses"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "assessment_answer_photos_type_check"
    CHECK ("content_type" IN ('image/jpeg', 'image/png', 'image/webp')),
  CONSTRAINT "assessment_answer_photos_bytes_check"
    CHECK (octet_length("bytes") BETWEEN 1 AND 491520)
);
CREATE INDEX "assessment_answer_photos_response_id_question_id_idx"
  ON "academic"."assessment_answer_photos"("response_id", "question_id");
