-- Wave 3 (P14-P16): Badges, Question Bank, Gamification, WA Log, AI Generate, PWA Push.
-- ADDITIVE & IDEMPOTENT (prod-safe). 9 new tables across 4 schemas, 4 new enums, 1 new schema.
-- No ALTER TABLE on existing tables — back-relations are Prisma-level only (virtual).

-- ── New Schema ──────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS "gamification";

-- ── Enums (academic schema) ─────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "academic"."QuestionType" AS ENUM ('multiple_choice', 'essay', 'true_false', 'matching');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "academic"."QuestionDifficulty" AS ENUM ('easy', 'medium', 'hard');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "academic"."BadgeTier" AS ENUM ('bronze', 'silver', 'gold', 'platinum');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── Enums (notification schema) ──────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "notification"."WaLogStatus" AS ENUM ('pending', 'sent', 'delivered', 'read', 'failed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── P14 W3-2: Question Bank (academic schema) ───────────────────────────────
CREATE TABLE IF NOT EXISTS "academic"."questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "teacher_id" UUID NOT NULL,
    "subject" VARCHAR(100) NOT NULL,
    "type" "academic"."QuestionType" NOT NULL,
    "body" TEXT NOT NULL,
    "options" JSONB,
    "answer" TEXT,
    "difficulty" "academic"."QuestionDifficulty" NOT NULL DEFAULT 'medium',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "questions_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teacher"."teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "questions_teacher_id_subject_idx" ON "academic"."questions"("teacher_id", "subject");
CREATE INDEX IF NOT EXISTS "questions_subject_type_idx" ON "academic"."questions"("subject", "type");

CREATE TABLE IF NOT EXISTS "academic"."question_sets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "teacher_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_sets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "question_sets_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teacher"."teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "question_sets_teacher_id_idx" ON "academic"."question_sets"("teacher_id");

-- ── P14 W3-1: Badges (academic schema) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS "academic"."badges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "icon" VARCHAR(50) NOT NULL,
    "criteria" JSONB NOT NULL,
    "tier" "academic"."BadgeTier" NOT NULL DEFAULT 'bronze',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "badges_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "badges_code_key" UNIQUE ("code")
);

CREATE INDEX IF NOT EXISTS "badges_is_active_idx" ON "academic"."badges"("is_active");
CREATE INDEX IF NOT EXISTS "badges_tier_idx" ON "academic"."badges"("tier");

CREATE TABLE IF NOT EXISTS "academic"."student_badges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "badge_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "awarded_by" UUID,
    "awarded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_badges_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "student_badges_badge_id_student_id_key" UNIQUE ("badge_id", "student_id"),
    CONSTRAINT "student_badges_badge_id_fkey" FOREIGN KEY ("badge_id") REFERENCES "academic"."badges"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "student_badges_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"."students"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "student_badges_student_id_idx" ON "academic"."student_badges"("student_id");

-- ── P15 W3-4: WhatsApp Notification Log (notification schema) ────────────────
CREATE TABLE IF NOT EXISTS "notification"."wa_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID,
    "parent_id" UUID,
    "recipient" VARCHAR(100) NOT NULL,
    "message" TEXT NOT NULL,
    "status" "notification"."WaLogStatus" NOT NULL DEFAULT 'pending',
    "event_type" VARCHAR(50),
    "notification_log_id" UUID,
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wa_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "wa_logs_student_id_created_at_idx" ON "notification"."wa_logs"("student_id", "created_at");
CREATE INDEX IF NOT EXISTS "wa_logs_parent_id_created_at_idx" ON "notification"."wa_logs"("parent_id", "created_at");
CREATE INDEX IF NOT EXISTS "wa_logs_event_type_created_at_idx" ON "notification"."wa_logs"("event_type", "created_at");
CREATE INDEX IF NOT EXISTS "wa_logs_status_created_at_idx" ON "notification"."wa_logs"("status", "created_at");

-- ── P15 W3-3: Gamification — Student XP (gamification schema) ───────────────
CREATE TABLE IF NOT EXISTS "gamification"."student_xp" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "total_xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "streak_days" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_xp_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "student_xp_student_id_key" UNIQUE ("student_id"),
    CONSTRAINT "student_xp_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"."students"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "gamification"."xp_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_xp_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" VARCHAR(255) NOT NULL,
    "source" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "xp_transactions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "xp_transactions_student_xp_id_fkey" FOREIGN KEY ("student_xp_id") REFERENCES "gamification"."student_xp"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "xp_transactions_student_xp_id_created_at_idx" ON "gamification"."xp_transactions"("student_xp_id", "created_at");

-- ── P16 W3-5: AI Generation Audit Trail (ai_knowledge schema) ────────────────
CREATE TABLE IF NOT EXISTS "ai_knowledge"."ai_generations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "teacher_id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "prompt" TEXT NOT NULL,
    "output" TEXT NOT NULL,
    "model" VARCHAR(100) NOT NULL,
    "tokens_used" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_generations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ai_generations_teacher_id_created_at_idx" ON "ai_knowledge"."ai_generations"("teacher_id", "created_at");
CREATE INDEX IF NOT EXISTS "ai_generations_type_created_at_idx" ON "ai_knowledge"."ai_generations"("type", "created_at");

-- ── P16 W3-6: PWA Push Subscriptions (notification schema) ──────────────────
CREATE TABLE IF NOT EXISTS "notification"."push_subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "keys" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "push_subscriptions_user_id_endpoint_key" UNIQUE ("user_id", "endpoint")
);

CREATE INDEX IF NOT EXISTS "push_subscriptions_user_id_idx" ON "notification"."push_subscriptions"("user_id");
