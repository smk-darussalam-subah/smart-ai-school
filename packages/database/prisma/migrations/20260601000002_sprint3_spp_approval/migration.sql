-- AlterTable: additive migration — tambah approval fields ke SppPayment (SMA-41)
-- approvedBy: auth.users.id (no FK, audit policy konsisten dengan recordedBy)
-- approvedAt: timestamp approval oleh SA/KS
ALTER TABLE "finance"."spp_payments" ADD COLUMN "approved_by" UUID,
ADD COLUMN "approved_at" TIMESTAMP(3);
