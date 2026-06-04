-- SMA-49: Chat history — additive migration
-- Tabel baru di schema ai_knowledge, tidak menyentuh tabel lain.

-- CreateEnum
CREATE TYPE "ai_knowledge"."MessageRole" AS ENUM ('user', 'assistant');

-- CreateTable
CREATE TABLE "ai_knowledge"."chat_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "title" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_knowledge"."chat_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "role" "ai_knowledge"."MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chat_sessions_user_id_idx" ON "ai_knowledge"."chat_sessions"("user_id");

-- CreateIndex
CREATE INDEX "chat_messages_session_id_created_at_idx" ON "ai_knowledge"."chat_messages"("session_id", "created_at");

-- AddForeignKey
ALTER TABLE "ai_knowledge"."chat_messages" ADD CONSTRAINT "chat_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "ai_knowledge"."chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
