import { AccountStatus } from "../generated/prisma/enums.js";

export const isActiveAccount = (
  account: { isActive: boolean; status: AccountStatus } | null,
) => !!account && account.isActive && account.status === AccountStatus.ACTIVE;
