-- R3: token link publik "Ruang Guru" (rotatable, disimpan di school_profile). Additive.
ALTER TABLE "school"."school_profile" ADD COLUMN IF NOT EXISTS "kiosk_token" VARCHAR(64);
CREATE UNIQUE INDEX IF NOT EXISTS "school_profile_kiosk_token_key" ON "school"."school_profile"("kiosk_token");
