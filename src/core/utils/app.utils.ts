import { AppStatus } from "../generated/prisma/enums.js";
import { normalizeRbacKey } from "./rbac.utils.js";
import { publicUrl } from "../../utils/s3.js";

/** Matches the column width — `App.key` is `VarChar(100)`. */
const APP_KEY_MAX_LENGTH = 100;

export const APP_SELECT = {
  id: true,
  name: true,
  key: true,
  description: true,
  iconKey: true,
  appUrl: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

const VALID_APP_STATUSES = Object.values(AppStatus);

export const validAppStatuses = () => VALID_APP_STATUSES.join(", ");

export const isValidAppStatus = (status: unknown): status is AppStatus =>
  typeof status === "string" &&
  VALID_APP_STATUSES.includes(status as AppStatus);

/**
 * The same slug rule permission and role keys already use — trimmed, lowercased,
 * `^[a-z0-9][a-z0-9._:-]*$`.
 *
 * An app key is a URL path segment in every route that touches the app, both
 * here and in the admin console. Storing it raw meant `"My App"` and `" stock"`
 * registered fine and were then unreachable, and `"a/b"` produced a path that
 * split into two segments. Normalizing on the way in and on lookup means a key
 * is always addressable, and `/apps/Inventory` resolves to `inventory`.
 */
export const appKeyFromValue = (value: unknown) =>
  normalizeRbacKey(value, APP_KEY_MAX_LENGTH);

/**
 * `iconKey` never leaves the API — clients get a resolved `iconUrl`, the same
 * field they have always received, so the column changing shape is invisible to
 * them.
 */
export const serializeApp = <
  T extends {
    id: string;
    iconKey?: string | null;
    _count?: {
      organizationApps?: number;
      appPermissions?: number;
      appRoles?: number;
    };
  },
>(
  app: T,
) => {
  const { _count, iconKey, ...rest } = app;
  return {
    ...rest,
    id: app.id.toString(),
    iconUrl: publicUrl(iconKey),
    _count: _count
      ? {
          organizationApps: _count.organizationApps,
          permissions: _count.appPermissions,
          roles: _count.appRoles,
          appRoles: _count.appRoles,
        }
      : undefined,
  };
};
