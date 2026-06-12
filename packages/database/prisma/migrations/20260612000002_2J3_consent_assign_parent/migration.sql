-- 2J-3: consent_at pada auth.users (R-05 timestamp persetujuan data pengguna)

ALTER TABLE "auth"."users" ADD COLUMN "consent_at" TIMESTAMP;
