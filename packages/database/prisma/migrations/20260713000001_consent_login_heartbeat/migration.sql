-- PDP Consent versioning (R-05 enhancement)
ALTER TABLE "auth"."users" ADD COLUMN IF NOT EXISTS "consent_version" VARCHAR(20);

-- Heartbeat / online user tracking
ALTER TABLE "auth"."users" ADD COLUMN IF NOT EXISTS "last_seen_at" TIMESTAMPTZ(3);

-- Login event tracking table (denormalized — no FK, like audit_log)
CREATE TABLE IF NOT EXISTS "auth"."login_events" (
    "id"         TEXT NOT NULL DEFAULT gen_random_uuid(),
    "user_id"    UUID NOT NULL,
    "user_role"  VARCHAR(50) NOT NULL,
    "user_name"  VARCHAR(255) NOT NULL,
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(500),
    "event_type" VARCHAR(20) NOT NULL, -- 'login' | 'logout' | 'failed'
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "login_events_user_id_idx"  ON "auth"."login_events"("user_id");
CREATE INDEX IF NOT EXISTS "login_events_created_at_idx" ON "auth"."login_events"("created_at");
CREATE INDEX IF NOT EXISTS "login_events_event_type_idx" ON "auth"."login_events"("event_type");
