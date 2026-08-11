UPDATE "academic"."question_import_rows" import_rows
SET "question_id" = NULL
WHERE import_rows."question_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "academic"."questions" questions
    WHERE questions."id" = import_rows."question_id"
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'question_import_rows_question_id_fkey'
      AND connamespace = 'academic'::regnamespace
  ) THEN
    ALTER TABLE "academic"."question_import_rows"
      ADD CONSTRAINT "question_import_rows_question_id_fkey"
      FOREIGN KEY ("question_id")
      REFERENCES "academic"."questions"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

WITH ranked AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "ref_type", "ref_id", "recipient", "channel"
      ORDER BY
        CASE "status" WHEN 'sent' THEN 0 ELSE 1 END,
        "created_at" ASC,
        "id" ASC
    ) AS rn
  FROM "notification"."notification_logs"
  WHERE "ref_type" IS NOT NULL
    AND "ref_id" IS NOT NULL
    AND "status" IN ('pending', 'sent')
)
UPDATE "notification"."notification_logs" logs
SET
  "status" = 'failed',
  "error" = COALESCE(logs."error", 'Duplicate active ref notification quarantined before Wave 4 unique index')
FROM ranked
WHERE logs."id" = ranked."id"
  AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "notification_logs_ref_active_unique"
  ON "notification"."notification_logs"("ref_type", "ref_id", "recipient", "channel")
  WHERE "ref_type" IS NOT NULL
    AND "ref_id" IS NOT NULL
    AND "status" IN ('pending', 'sent');
