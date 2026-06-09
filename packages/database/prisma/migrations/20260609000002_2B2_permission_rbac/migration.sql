-- 2B-2: Permission-based RBAC — additive CREATE-only
-- 7 role tetap dasar (Keycloak realm roles). Permission = granular aksi.
-- Tidak ada DROP/ALTER destruktif.

-- CreateTable: permissions
CREATE TABLE "auth"."permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(100) NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "module" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "permissions_code_key" ON "auth"."permissions"("code");

-- CreateTable: role_permissions
CREATE TABLE "auth"."role_permissions" (
    "role" "auth"."UserRole" NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role","permission_id")
);

-- CreateTable: user_permission_overrides
CREATE TABLE "auth"."user_permission_overrides" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "grant" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_permission_overrides_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_permission_overrides_user_id_permission_id_key" ON "auth"."user_permission_overrides"("user_id", "permission_id");

-- AddForeignKey: role_permissions → permissions
ALTER TABLE "auth"."role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "auth"."permissions"("id") ON UPDATE CASCADE ON DELETE CASCADE;

-- AddForeignKey: user_permission_overrides → permissions
ALTER TABLE "auth"."user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "auth"."permissions"("id") ON UPDATE CASCADE ON DELETE CASCADE;
