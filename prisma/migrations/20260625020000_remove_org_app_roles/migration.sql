-- AppRole is the only supported app-role source. Existing organization-specific
-- assignments cannot be mapped reliably to shared roles, so remove them.
ALTER TABLE "member_app_roles"
DROP CONSTRAINT "member_app_roles_exactly_one_role_source";

ALTER TABLE "member_app_roles"
DROP CONSTRAINT "member_app_roles_role_id_fkey";

DELETE FROM "member_app_roles"
WHERE "role_id" IS NOT NULL;

ALTER TABLE "member_app_roles"
DROP COLUMN "role_id",
ALTER COLUMN "app_role_id" SET NOT NULL;

DROP TABLE "role_permissions";
DROP TABLE "roles";
