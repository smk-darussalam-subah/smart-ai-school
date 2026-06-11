-- 2D-3: Pengumuman Sekolah — additive CREATE-only (referensi KamilEdu Modul 14)
-- Schema: notification. Tidak ada DROP/ALTER destruktif.

CREATE SCHEMA IF NOT EXISTS "notification";

-- CreateEnum
CREATE TYPE "notification"."AnnouncementCategory" AS ENUM ('umum', 'akademik', 'keuangan', 'kegiatan', 'darurat');
CREATE TYPE "notification"."AnnouncementPriority" AS ENUM ('biasa', 'penting', 'urgent');
CREATE TYPE "notification"."AnnouncementStatus" AS ENUM ('draft', 'published', 'archived');

-- CreateTable
CREATE TABLE "notification"."announcements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR(255) NOT NULL,
    "content" TEXT NOT NULL,
    "category" "notification"."AnnouncementCategory" NOT NULL DEFAULT 'umum',
    "priority" "notification"."AnnouncementPriority" NOT NULL DEFAULT 'biasa',
    "audience" JSONB NOT NULL DEFAULT '["ALL"]',
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "status" "notification"."AnnouncementStatus" NOT NULL DEFAULT 'draft',
    "published_at" TIMESTAMP(3),
    "scheduled_at" TIMESTAMP(3),
    "created_by" VARCHAR(64),
    "created_by_name" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "announcements_status_is_pinned_published_at_idx" ON "notification"."announcements"("status", "is_pinned", "published_at" DESC);
CREATE INDEX "announcements_category_status_idx" ON "notification"."announcements"("category", "status");
