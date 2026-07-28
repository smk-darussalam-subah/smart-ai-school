-- Appointment Governance Wave C architectural follow-up.
-- Director decision: Capacity Option A.
--
-- Position.max_active_holders makes deputy capacity explicit. Core positions
-- default to one active holder; WAKIL_KOOR_BKK and WAKIL_KOOR_HUBIN can be
-- configured above one without adding a slot model in this wave.
--
-- The trigger below replaces the old one-holder-only active unique indexes for
-- position scope capacity. It locks the position catalog row during ACTIVE
-- writes so concurrent activation attempts cannot exceed configured capacity.

ALTER TABLE "school"."positions"
  ADD COLUMN IF NOT EXISTS "max_active_holders" INTEGER NOT NULL DEFAULT 1;

UPDATE "school"."positions"
SET "max_active_holders" = 1
WHERE "max_active_holders" < 1;

UPDATE "school"."positions"
SET "max_active_holders" = 2
WHERE "code" IN ('WAKIL_KOOR_BKK', 'WAKIL_KOOR_HUBIN')
  AND "max_active_holders" < 2;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'positions_max_active_holders_check'
      AND connamespace = 'school'::regnamespace
  ) THEN
    ALTER TABLE "school"."positions"
      ADD CONSTRAINT "positions_max_active_holders_check"
      CHECK ("max_active_holders" >= 1);
  END IF;
END $$;

DROP INDEX IF EXISTS "school"."appointment_unique_school_position_live";
DROP INDEX IF EXISTS "school"."appointment_unique_major_position_live";
DROP INDEX IF EXISTS "school"."appointment_unique_school_position_open_candidate";
DROP INDEX IF EXISTS "school"."appointment_unique_major_position_open_candidate";

CREATE OR REPLACE FUNCTION "school"."appointment_enforce_active_capacity"()
RETURNS TRIGGER AS $$
DECLARE
  holder_capacity INTEGER;
  scope_count INTEGER;
BEGIN
  IF NEW."status" <> 'ACTIVE'
    AND NOT (
      NEW."status" IN ('PENDING_APPROVAL', 'APPROVED')
      AND NEW."replaces_appointment_id" IS NULL
    ) THEN
    RETURN NEW;
  END IF;

  SELECT "max_active_holders"
  INTO holder_capacity
  FROM "school"."positions"
  WHERE "id" = NEW."position_id"
  FOR UPDATE;

  IF holder_capacity IS NULL THEN
    RAISE EXCEPTION 'position % not found for appointment capacity check', NEW."position_id"
      USING ERRCODE = '23503';
  END IF;

  SELECT COUNT(*)
  INTO scope_count
  FROM "school"."appointments" a
  WHERE a."position_id" = NEW."position_id"
    AND a."academic_year_id" = NEW."academic_year_id"
    AND a."id" <> NEW."id"
    AND (
      a."status" = 'ACTIVE'
      OR (
        a."status" IN ('PENDING_APPROVAL', 'APPROVED')
        AND a."replaces_appointment_id" IS NULL
      )
    )
    AND (
      (a."major_id" IS NULL AND NEW."major_id" IS NULL)
      OR a."major_id" = NEW."major_id"
    );

  IF scope_count >= holder_capacity THEN
    RAISE EXCEPTION 'appointment active capacity exceeded'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "appointment_scope_capacity_guard" ON "school"."appointments";
CREATE TRIGGER "appointment_scope_capacity_guard"
BEFORE INSERT OR UPDATE OF "status", "position_id", "academic_year_id", "major_id", "replaces_appointment_id"
ON "school"."appointments"
FOR EACH ROW
EXECUTE FUNCTION "school"."appointment_enforce_active_capacity"();
