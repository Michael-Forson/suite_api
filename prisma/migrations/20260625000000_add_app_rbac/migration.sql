-- CreateEnum
CREATE TYPE "PermissionStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- AlterTable
ALTER TABLE "permissions"
ADD COLUMN "status" "PermissionStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "app_roles" (
    "id" BIGSERIAL NOT NULL,
    "app_id" BIGINT NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "status" "RoleStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_role_permissions" (
    "id" BIGSERIAL NOT NULL,
    "app_role_id" BIGINT NOT NULL,
    "permission_id" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_role_permissions_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "member_app_roles"
ALTER COLUMN "role_id" DROP NOT NULL,
ADD COLUMN "app_role_id" BIGINT;

-- CreateIndex
CREATE INDEX "permissions_status_idx" ON "permissions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "app_roles_app_id_key_key" ON "app_roles"("app_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "app_roles_app_id_name_key" ON "app_roles"("app_id", "name");

-- CreateIndex
CREATE INDEX "app_roles_status_idx" ON "app_roles"("status");

-- CreateIndex
CREATE INDEX "app_roles_is_default_idx" ON "app_roles"("is_default");

-- Enforce one default role per app, including across concurrent requests.
CREATE UNIQUE INDEX "app_roles_one_default_per_app"
ON "app_roles"("app_id")
WHERE "is_default" = true;

-- CreateIndex
CREATE UNIQUE INDEX "app_role_permissions_app_role_id_permission_id_key"
ON "app_role_permissions"("app_role_id", "permission_id");

-- CreateIndex
CREATE INDEX "app_role_permissions_permission_id_idx"
ON "app_role_permissions"("permission_id");

-- CreateIndex
CREATE INDEX "member_app_roles_app_role_id_idx"
ON "member_app_roles"("app_role_id");

-- AddForeignKey
ALTER TABLE "app_roles"
ADD CONSTRAINT "app_roles_app_id_fkey"
FOREIGN KEY ("app_id") REFERENCES "apps"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_role_permissions"
ADD CONSTRAINT "app_role_permissions_app_role_id_fkey"
FOREIGN KEY ("app_role_id") REFERENCES "app_roles"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_role_permissions"
ADD CONSTRAINT "app_role_permissions_permission_id_fkey"
FOREIGN KEY ("permission_id") REFERENCES "permissions"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_app_roles"
ADD CONSTRAINT "member_app_roles_app_role_id_fkey"
FOREIGN KEY ("app_role_id") REFERENCES "app_roles"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve every legacy custom-role assignment while requiring all new and
-- existing rows to point to exactly one role source.
ALTER TABLE "member_app_roles"
ADD CONSTRAINT "member_app_roles_exactly_one_role_source"
CHECK (("role_id" IS NOT NULL) <> ("app_role_id" IS NOT NULL));
