-- TF2-P1-1 Zombie Permissions fix
-- Director-approved policy: Opsi A + quarantine fail-closed.
--
-- Classification policy:
-- - pre-migration grant=true lacks reliable provenance and is quarantined.
-- - current active StaffPosition rows are the source of truth for position
--   grants and are recreated as scoped ACTIVE overrides.
-- - grant=false is retained as an active global revoke because it is
--   least-privilege and does not grant access.
--
-- The NOTICE block emits counts only and avoids identifying fields.
-- Note: Prisma migration engine wraps each migration in its own transaction;
-- do NOT add explicit BEGIN/COMMIT here (causes nested transaction abort).

DO $$
BEGIN
  CREATE TYPE "auth"."PermissionOverrideSource" AS ENUM (
    'MANUAL',
    'POSITION_ASSIGNMENT',
    'MIGRATION_QUARANTINE'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "auth"."PermissionOverrideStatus" AS ENUM (
    'ACTIVE',
    'QUARANTINED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "auth"."user_permission_overrides"
  ADD COLUMN IF NOT EXISTS "academic_year_id" UUID,
  ADD COLUMN IF NOT EXISTS "staff_position_id" UUID,
  ADD COLUMN IF NOT EXISTS "source" "auth"."PermissionOverrideSource" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS "status" "auth"."PermissionOverrideStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS "reason" VARCHAR(255);

CREATE TEMP TABLE "_tf2_p1_1_override_inventory" ON COMMIT DROP AS
WITH matched AS (
  SELECT
    upo."id",
    COUNT(sp."id") FILTER (WHERE pp."permission_id" IS NOT NULL) AS matching_position_count
  FROM "auth"."user_permission_overrides" upo
  LEFT JOIN "school"."staff" s
    ON s."user_id" = upo."user_id"
  LEFT JOIN "school"."staff_positions" sp
    ON sp."staff_id" = s."id"
    AND sp."is_active" = TRUE
  LEFT JOIN "school"."position_permissions" pp
    ON pp."position_id" = sp."position_id"
    AND pp."permission_id" = upo."permission_id"
  GROUP BY upo."id"
)
SELECT
  upo."id",
  upo."grant",
  COALESCE(m.matching_position_count, 0) AS matching_position_count,
  CASE
    WHEN upo."grant" = TRUE
      THEN 'QUARANTINED_HISTORICAL_GRANT'
    ELSE 'GLOBAL_REVOKE_ACTIVE'
  END AS classification
FROM "auth"."user_permission_overrides" upo
LEFT JOIN matched m
  ON m."id" = upo."id";

CREATE TEMP TABLE "_tf2_p1_1_recreated_position_grants" ON COMMIT DROP AS
SELECT
  s."user_id",
  pp."permission_id",
  sp."academic_year_id",
  (ARRAY_AGG(sp."id" ORDER BY sp."created_at" DESC, sp."id"))[1] AS staff_position_id
FROM "school"."staff_positions" sp
JOIN "school"."staff" s
  ON s."id" = sp."staff_id"
JOIN "school"."position_permissions" pp
  ON pp."position_id" = sp."position_id"
JOIN "auth"."permissions" perm
  ON perm."id" = pp."permission_id"
WHERE sp."is_active" = TRUE
GROUP BY s."user_id", pp."permission_id", sp."academic_year_id";

UPDATE "auth"."user_permission_overrides" upo
SET
  "academic_year_id" = NULL,
  "staff_position_id" = NULL,
  "source" = 'MIGRATION_QUARANTINE',
  "status" = 'QUARANTINED',
  "reason" = 'Historical grant lacks provenance; review required before activation'
FROM "_tf2_p1_1_override_inventory" inv
WHERE upo."id" = inv."id"
  AND inv.classification = 'QUARANTINED_HISTORICAL_GRANT';

UPDATE "auth"."user_permission_overrides" upo
SET
  "academic_year_id" = NULL,
  "staff_position_id" = NULL,
  "source" = 'MANUAL',
  "status" = 'ACTIVE',
  "reason" = 'Pre-migration revoke retained as global least-privilege override'
FROM "_tf2_p1_1_override_inventory" inv
WHERE upo."id" = inv."id"
  AND inv.classification = 'GLOBAL_REVOKE_ACTIVE';

DROP INDEX IF EXISTS "auth"."user_permission_overrides_user_id_permission_id_key";
DROP INDEX IF EXISTS "auth"."user_permission_overrides_global_uniq";
DROP INDEX IF EXISTS "auth"."user_permission_overrides_global_active_uniq";
DROP INDEX IF EXISTS "auth"."user_permission_overrides_user_perm_year_key";
DROP INDEX IF EXISTS "auth"."user_permission_overrides_user_year_idx";
DROP INDEX IF EXISTS "auth"."user_permission_overrides_user_status_year_idx";
DROP INDEX IF EXISTS "auth"."user_permission_overrides_status_source_idx";

INSERT INTO "auth"."user_permission_overrides" (
  "user_id",
  "permission_id",
  "grant",
  "academic_year_id",
  "staff_position_id",
  "source",
  "status",
  "reason"
)
SELECT
  pg."user_id",
  pg."permission_id",
  TRUE,
  pg."academic_year_id",
  pg.staff_position_id,
  'POSITION_ASSIGNMENT',
  'ACTIVE',
  'Recreated from active staff position during TF2-P1-1 migration'
FROM "_tf2_p1_1_recreated_position_grants" pg
WHERE NOT EXISTS (
  SELECT 1
  FROM "auth"."user_permission_overrides" existing
  WHERE existing."user_id" = pg."user_id"
    AND existing."permission_id" = pg."permission_id"
    AND existing."academic_year_id" = pg."academic_year_id"
    AND existing."source" = 'POSITION_ASSIGNMENT'
    AND existing."status" = 'ACTIVE'
);

DO $$
DECLARE
  total_count INTEGER;
  recreated_position_count INTEGER;
  quarantined_count INTEGER;
  global_revoke_count INTEGER;
  candidate_single_match_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_count
  FROM "_tf2_p1_1_override_inventory";

  SELECT COUNT(*) INTO recreated_position_count
  FROM "_tf2_p1_1_recreated_position_grants";

  SELECT COUNT(*) INTO quarantined_count
  FROM "_tf2_p1_1_override_inventory"
  WHERE classification = 'QUARANTINED_HISTORICAL_GRANT';

  SELECT COUNT(*) INTO global_revoke_count
  FROM "_tf2_p1_1_override_inventory"
  WHERE classification = 'GLOBAL_REVOKE_ACTIVE';

  SELECT COUNT(*) INTO candidate_single_match_count
  FROM "_tf2_p1_1_override_inventory"
  WHERE "grant" = TRUE
    AND matching_position_count = 1;

  RAISE NOTICE
    'TF2-P1-1 inventory: total=%, recreated_position_scoped=%, quarantined_historical_grants=%, global_revokes=%, single_match_candidates=%',
    total_count,
    recreated_position_count,
    quarantined_count,
    global_revoke_count,
    candidate_single_match_count;
END $$;

CREATE UNIQUE INDEX "user_permission_overrides_global_active_uniq"
ON "auth"."user_permission_overrides" ("user_id", "permission_id")
WHERE "academic_year_id" IS NULL AND "status" = 'ACTIVE';

CREATE UNIQUE INDEX "user_permission_overrides_user_perm_year_key"
ON "auth"."user_permission_overrides" ("user_id", "permission_id", "academic_year_id");

CREATE INDEX "user_permission_overrides_user_status_year_idx"
ON "auth"."user_permission_overrides" ("user_id", "status", "academic_year_id");

CREATE INDEX "user_permission_overrides_status_source_idx"
ON "auth"."user_permission_overrides" ("status", "source");
