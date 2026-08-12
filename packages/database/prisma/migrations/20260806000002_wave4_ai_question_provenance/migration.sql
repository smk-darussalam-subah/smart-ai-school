DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'QuestionSource'
      AND n.nspname = 'academic'
  ) THEN
    CREATE TYPE "academic"."QuestionSource" AS ENUM ('MANUAL', 'AI_ASSISTED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'CognitiveLevel'
      AND n.nspname = 'academic'
  ) THEN
    CREATE TYPE "academic"."CognitiveLevel" AS ENUM ('C1', 'C2', 'C3', 'C4', 'C5', 'C6');
  END IF;
END $$;

ALTER TABLE "academic"."questions"
  ADD COLUMN IF NOT EXISTS "source" "academic"."QuestionSource" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS "ai_generation_id" UUID,
  ADD COLUMN IF NOT EXISTS "ai_item_key" VARCHAR(80),
  ADD COLUMN IF NOT EXISTS "tp_refs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "cognitive_level" "academic"."CognitiveLevel";

ALTER TABLE "ai_knowledge"."ai_generations"
  ADD COLUMN IF NOT EXISTS "source_type" VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "source_id" UUID,
  ADD COLUMN IF NOT EXISTS "status" VARCHAR(30),
  ADD COLUMN IF NOT EXISTS "request_spec" JSONB,
  ADD COLUMN IF NOT EXISTS "context_snapshot" JSONB,
  ADD COLUMN IF NOT EXISTS "idempotency_key" VARCHAR(120);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'questions_ai_generation_id_fkey'
      AND connamespace = 'academic'::regnamespace
  ) THEN
    ALTER TABLE "academic"."questions"
      ADD CONSTRAINT "questions_ai_generation_id_fkey"
      FOREIGN KEY ("ai_generation_id")
      REFERENCES "ai_knowledge"."ai_generations"("id")
      ON DELETE RESTRICT
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'questions_provenance_shape_chk'
      AND connamespace = 'academic'::regnamespace
  ) THEN
    ALTER TABLE "academic"."questions"
      ADD CONSTRAINT "questions_provenance_shape_chk"
      CHECK (
        (
          "source" = 'MANUAL'
          AND "ai_generation_id" IS NULL
          AND "ai_item_key" IS NULL
          AND cardinality("tp_refs") = 0
          AND "cognitive_level" IS NULL
        )
        OR
        (
          "source" = 'AI_ASSISTED'
          AND "ai_generation_id" IS NOT NULL
          AND "ai_item_key" IS NOT NULL
          AND cardinality("tp_refs") > 0
          AND "cognitive_level" IS NOT NULL
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ai_generations_source_context_chk'
      AND connamespace = 'ai_knowledge'::regnamespace
  ) THEN
    ALTER TABLE "ai_knowledge"."ai_generations"
      ADD CONSTRAINT "ai_generations_source_context_chk"
      CHECK (
        (
          "source_type" IS NULL
          AND "source_id" IS NULL
        )
        OR
        (
          "source_type" IN ('rpp', 'module')
          AND "source_id" IS NOT NULL
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "questions_source_idx"
  ON "academic"."questions"("source");

CREATE INDEX IF NOT EXISTS "questions_ai_generation_id_idx"
  ON "academic"."questions"("ai_generation_id");

CREATE UNIQUE INDEX IF NOT EXISTS "questions_ai_generation_id_ai_item_key_key"
  ON "academic"."questions"("ai_generation_id", "ai_item_key");

CREATE INDEX IF NOT EXISTS "ai_generations_source_type_source_id_idx"
  ON "ai_knowledge"."ai_generations"("source_type", "source_id");

DROP INDEX IF EXISTS "ai_knowledge"."ai_generations_idempotency_key_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "ai_generations_teacher_id_type_idempotency_key_key"
  ON "ai_knowledge"."ai_generations"("teacher_id", "type", "idempotency_key");

CREATE TABLE IF NOT EXISTS "ai_knowledge"."ai_draft_acceptances" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "ai_generation_id" UUID NOT NULL,
  "idempotency_key" VARCHAR(120) NOT NULL,
  "payload_fingerprint" VARCHAR(64) NOT NULL,
  "item_keys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ai_draft_acceptances_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_draft_acceptances_ai_generation_id_idempotency_key_key" UNIQUE ("ai_generation_id", "idempotency_key"),
  CONSTRAINT "ai_draft_acceptances_status_chk" CHECK ("status" IN ('pending', 'accepted'))
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ai_draft_acceptances_ai_generation_id_fkey'
      AND connamespace = 'ai_knowledge'::regnamespace
  ) THEN
    ALTER TABLE "ai_knowledge"."ai_draft_acceptances"
      ADD CONSTRAINT "ai_draft_acceptances_ai_generation_id_fkey"
      FOREIGN KEY ("ai_generation_id")
      REFERENCES "ai_knowledge"."ai_generations"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ai_draft_acceptances_status_created_at_idx"
  ON "ai_knowledge"."ai_draft_acceptances"("status", "created_at");
