import type { User } from "../db/schema.ts";

export function effectiveLimit(
  user: Pick<User, "depositLimitDaily" | "pendingDepositLimit" | "pendingLimitAt">,
) {
  if (user.pendingLimitAt && new Date(user.pendingLimitAt).getTime() <= Date.now()) {
    return user.pendingDepositLimit === null ? null : Number(user.pendingDepositLimit);
  }
  return user.depositLimitDaily === null ? null : Number(user.depositLimitDaily);
}
