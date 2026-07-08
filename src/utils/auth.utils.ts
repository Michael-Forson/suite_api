export function isSameUser(
  resourceUserId: string,
  requestUserId: string,
): boolean {
  return resourceUserId === requestUserId;
}
