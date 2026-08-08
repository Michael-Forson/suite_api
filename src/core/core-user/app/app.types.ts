import { AppStatus } from "../../generated/prisma/enums.js";

export interface RegisterAppRequestBody {
  name?: unknown;
  key?: unknown;
  description?: unknown;
  iconUrl?: unknown;
  status?: unknown;
}

export interface UpdateAppDetailsRequestBody {
  name?: unknown;
  description?: unknown;
  iconUrl?: unknown;
}

export interface ChangeAppStatusRequestBody {
  status?: AppStatus | string;
}
