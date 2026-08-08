/**
 * The root super-admin is whoever holds the address in `SUPER_ADMIN_EMAIL` —
 * the account the seed script creates. It is the one super-admin that cannot be
 * disabled and the only one that may manage the others, so the deployment owner
 * cannot be locked out by an account they invited.
 *
 * Identity comes from the env var rather than a database column on purpose:
 * nothing reachable over the API can promote an account to root.
 */
export const rootSuperAdminEmail = () =>
  process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase() || null;

/**
 * Read at call time, not at import: tests set the env per case, and a value
 * captured at module load would freeze the first one.
 *
 * With `SUPER_ADMIN_EMAIL` unset there is no root, and every management route
 * closes rather than opening to everyone.
 */
export const isRootSuperAdminEmail = (email: string | null | undefined) => {
  const root = rootSuperAdminEmail();
  if (!root || !email) return false;
  return email.trim().toLowerCase() === root;
};
