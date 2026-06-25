-- Keep the database invariant aligned with the API: a default role must always
-- remain active. The partial unique index from the previous migration already
-- limits each app to one default role.
ALTER TABLE "app_roles"
ADD CONSTRAINT "app_roles_default_must_be_active"
CHECK (NOT "is_default" OR "status" = 'ACTIVE');
