-- A Web Push endpoint identifies one browser subscription and must have one owner.
-- Preserve the newest row deterministically before adding the global invariant.
WITH ranked_subscriptions AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "endpoint"
      ORDER BY "created_at" DESC, "id" DESC
    ) AS row_number
  FROM "notification"."push_subscriptions"
)
DELETE FROM "notification"."push_subscriptions" AS subscription
USING ranked_subscriptions AS ranked
WHERE subscription."id" = ranked."id"
  AND ranked.row_number > 1;

ALTER TABLE "notification"."push_subscriptions"
  DROP CONSTRAINT "push_subscriptions_user_id_endpoint_key";

CREATE UNIQUE INDEX "push_subscriptions_endpoint_key"
  ON "notification"."push_subscriptions"("endpoint");
