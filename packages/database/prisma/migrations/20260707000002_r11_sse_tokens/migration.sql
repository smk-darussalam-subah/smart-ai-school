-- =============================================================================
-- R-11: SSE Token table — short-lived, one-time-use tokens for SSE auth
--
-- Replaces full Keycloak JWT in ?token=xxx query param to prevent token
-- exposure in browser history, server logs, and referrer headers.
-- Tokens expire in 5 minutes and can only be used once (used=false → true).
-- =============================================================================

CREATE TABLE "auth"."sse_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "token" VARCHAR(128) NOT NULL,
    "keycloak_id" UUID NOT NULL,
    "roles" TEXT[],
    "email" VARCHAR(255) NOT NULL DEFAULT '',
    "username" VARCHAR(255) NOT NULL DEFAULT '',
    "full_name" VARCHAR(255) NOT NULL DEFAULT '',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sse_tokens_pkey" PRIMARY KEY ("id")
);

-- Unique constraint on token (for O(1) lookup + prevent duplicates)
CREATE UNIQUE INDEX "sse_tokens_token_key" ON "auth"."sse_tokens"("token");

-- Composite index for validation query: WHERE token = ? AND expires_at > NOW()
CREATE INDEX "sse_tokens_token_expires_at_idx" ON "auth"."sse_tokens"("token", "expires_at");

-- Index for periodic cleanup: WHERE expires_at < NOW()
CREATE INDEX "sse_tokens_expires_at_idx" ON "auth"."sse_tokens"("expires_at");
