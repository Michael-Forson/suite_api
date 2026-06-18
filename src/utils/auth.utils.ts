export function isSameUser(
  resourceUserId: bigint | string,
  requestUserId: string,
): boolean {
  return resourceUserId.toString() === requestUserId;
}
