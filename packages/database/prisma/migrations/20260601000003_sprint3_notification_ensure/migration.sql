-- =============================================================================
-- Migration: 20260601000003_sprint3_notification_ensure
-- Description: Idempotent — pastikan notification_logs ada di production.
--
-- Konteks: sprint1_foundation (20260531000001) berisi CREATE TABLE notification_logs,
-- tetapi baris tersebut mungkin ditambahkan SETELAH migration di-apply ke production
-- (checksum mismatch → Prisma skip). Migration ini menjamin tabel ada.
-- Semua statement idempoten: CREATE TYPE/TABLE IF NOT EXISTS menggunakan DO block.
-- =============================================================================

-- Pastikan enums ada (DO block karena PostgreSQL tidak punya CREATE TYPE IF NOT EXISTS)
DO $$ BEGIN
  CREATE TYPE "notification"."NotifChannel" AS ENUM ('whatsapp', 'email', 'push');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "notification"."NotifStatus" AS ENUM ('pending', 'sent', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Pastikan tabel ada
CREATE TABLE IF NOT EXISTS "notification"."notification_logs" (
  "id"         UUID          NOT NULL DEFAULT gen_random_uuid(),
  "recipient"  VARCHAR(100)  NOT NULL,
  "channel"    "notification"."NotifChannel"  NOT NULL,
  "subject"    VARCHAR(255),
  "body"       TEXT          NOT NULL,
  "status"     "notification"."NotifStatus"   NOT NULL DEFAULT 'pending',
  "sent_at"    TIMESTAMP(3),
  "error"      TEXT,
  "ref_type"   TEXT,
  "ref_id"     UUID,
  "created_at" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- Indexes (IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS "notification_logs_recipient_created_at_idx"
  ON "notification"."notification_logs"("recipient", "created_at");

CREATE INDEX IF NOT EXISTS "notification_logs_status_idx"
  ON "notification"."notification_logs"("status");
