-- 2B-1: AuditLog persisten — additive CREATE-only
-- Prasyarat UU PDP + gerbang go-live data nyata.
-- PII-minimal: actorId=Keycloak sub, username, roles denormalisasi.
-- Tidak ada DROP/ALTER destruktif.

-- Buat schema audit (idempoten — migration bisa dijalankan berkali-kali di staging)
CREATE SCHEMA IF NOT EXISTS "audit";

-- CreateTable
CREATE TABLE "audit"."audit_log" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_id" TEXT,
    "actor_username" TEXT,
    "actor_roles" TEXT[] NOT NULL DEFAULT '{}',
    "action" TEXT NOT NULL,
    "resource_type" TEXT,
    "resource_id" TEXT,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status_code" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "metadata" JSONB,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit"."audit_log"("created_at");

-- CreateIndex
CREATE INDEX "audit_log_actor_id_created_at_idx" ON "audit"."audit_log"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_resource_type_resource_id_idx" ON "audit"."audit_log"("resource_type", "resource_id");
